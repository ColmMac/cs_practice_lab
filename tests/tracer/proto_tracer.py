"""Throwaway prototype to validate the sys.settrace design claims in the plan."""
import sys, json, io, builtins, time

USER_FILE = "<user>"

class StepLimit(BaseException):
    pass

def ser(v, seen=None, depth=0):
    seen = seen or set()
    if v is None: return {"k": "none"}
    if isinstance(v, bool): return {"k": "bool", "v": v}
    if isinstance(v, int): return {"k": "int", "v": str(v)}
    if isinstance(v, float): return {"k": "float", "v": repr(v)}
    if isinstance(v, str): return {"k": "str", "v": v}
    if isinstance(v, (list, tuple, set, dict)):
        if id(v) in seen: return {"k": "cycle", "ref": id(v)}
        seen = seen | {id(v)}
        if isinstance(v, dict):
            return {"k": "dict", "entries": [[ser(a, seen), ser(b, seen)] for a, b in v.items()]}
        return {"k": type(v).__name__, "items": [ser(x, seen) for x in v]}
    return {"k": "opaque", "type": type(v).__name__, "repr": repr(v)[:80]}

def visible(name, val):
    return not name.startswith("__") and not callable(val) and type(val).__name__ != "module"

def run(code, stdin=(), max_steps=200):
    steps, pending, last = [], {}, {}
    out = io.StringIO()
    inputs = list(stdin)
    count = [0]

    def snap(frame):
        return {k: json.dumps(ser(v)) for k, v in dict(frame.f_locals).items() if visible(k, v)}

    def finalize(frame, event, ret=None):
        fid = id(frame)
        if fid not in pending: return
        line = pending.pop(fid)
        s = snap(frame)
        prev = last.get(fid, {})
        changed = [k for k in s if prev.get(k) != s[k]]
        last[fid] = s
        o = out.getvalue(); out.seek(0); out.truncate()
        steps.append({"line": line, "fn": frame.f_code.co_name, "changed": {k: json.loads(s[k]) for k in changed},
                      "out": o, "event": event, "ret": None if ret is None else ser(ret)})

    def local(frame, event, arg):
        if event == "line":
            count[0] += 1
            if count[0] > max_steps:
                raise StepLimit()
            finalize(frame, "line")
            pending[id(frame)] = frame.f_lineno
        elif event == "return":
            finalize(frame, "return", arg)
            last.pop(id(frame), None)
        return local

    def glob(frame, event, arg):
        if frame.f_code.co_filename != USER_FILE:
            return None
        return local

    def fake_input(prompt=""):
        if not inputs: raise EOFError("no more inputs")
        v = inputs.pop(0); out.write(f"{prompt}{v}\n"); return v

    b = dict(vars(builtins)); b["input"] = fake_input
    g = {"__name__": "__main__", "__builtins__": b}
    code_obj = compile(code, USER_FILE, "exec")
    old = sys.stdout; sys.stdout = out
    status = "ok"
    sys.settrace(glob)
    try:
        exec(code_obj, g)
    except StepLimit:
        status = "step-limit"
    except Exception as e:
        status = f"error {type(e).__name__}: {e}"
    finally:
        sys.settrace(None); sys.stdout = old
    return status, steps

def show(title, code, **kw):
    status, steps = run(code, **kw)
    print(f"== {title} [{sys.version.split()[0]}] status={status} rows={len(steps)}")
    for s in steps:
        ch = {k: (v.get("v") if "v" in v else v) for k, v in s["changed"].items()}
        print(f"  L{s['line']:<2} {s['fn']:<10} {s['event']:<6} changed={ch} out={s['out']!r} ret={s['ret']}")

show("while loop", """\
n = 1234
total = 0
while n > 0:
    total = total + n % 10
    n = n // 10
print(total)
""")

show("recursion", """\
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
r = fact(3)
""")

show("aliasing mutation in callee", """\
def bump(a):
    a[0] = 99
nums = [1, 2]
bump(nums)
x = 1
""")

show("comprehension + input", """\
name = input("Name? ")
sq = [i * i for i in range(3)]
""", stdin=["Ada"])

show("infinite loop", "i = 0\nwhile True:\n    i += 1\n", max_steps=12)

show("bare except swallows limit", "i = 0\nwhile True:\n    try:\n        i += 1\n    except:\n        pass\n    if i > 50: break\n", max_steps=12)
