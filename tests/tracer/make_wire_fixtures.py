"""Regenerates tests/fixtures/wire/*.json from the real tracer (consumed by the Vitest suite).

    npm run fixtures

Re-run after any change to tracer.py's output or to a preset; review the diff, since it is the wire
contract. Presets are read from src/languages/python/presets/ (the same files the app ships).
"""

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "languages" / "python"))
import tracer  # noqa: E402

OUT = ROOT / "tests" / "fixtures" / "wire"
PRESETS = ROOT / "src" / "languages" / "python" / "presets"

CASES = {
    "digit-sum": ("n = 1234\ntotal = 0\nwhile n > 0:\n    digit = n % 10\n    total = total + digit\n    n = n // 10\nprint(total)\n", {}),
    "factorial": ("def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nresult = fact(3)\nprint(result)\n", {}),
    "zero-division": ("a = 1\nb = a / 0\n", {}),
    "infinite-loop": ("i = 0\nwhile True:\n    i += 1\n", {"maxSteps": 12}),
    # step explanations: `+=`, a swap, globals read in a function, a negative number, a long string,
    # a list changed by a method call, and a `for` loop
    "explain": (
        "count = 2\nstep = -3\ntitle = 'a title that is far too long'\n\ndef bump(extra):\n    total = count + extra\n    return total ** 2\n\n"
        "count += 1\na = 1\nb = 2\na, b = b, a\ntag = title + '!'\nsq = step ** 2\nnums = [a]\nnums.append(b)\ny = bump(a)\n"
        "for k in range(1):\n    pass\n",
        {},
    ),
    "syntax-error": ("if x\n    pass\n", {}),
    "needs-input": ("name = input('Name? ')\nprint(name)\n", {}),
    # watch results: `cond` flips when the loop ends; `fn` is the innermost live fact() call; `bad` is rejected
    "watches-loop": (
        "n = 3\ni = 0\nwhile i < n:\n    i += 1\n",
        {"watches": [{"id": "cond", "expr": "i < n", "scope": {"kind": "current"}}]},
    ),
    "watches-fn": (
        "def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nresult = fact(3)\n",
        {
            "watches": [
                {"id": "cur", "expr": "n", "scope": {"kind": "current"}},
                {"id": "fn", "expr": "n", "scope": {"kind": "function", "name": "fact"}},
                {"id": "bad", "expr": "result.pop()", "scope": {"kind": "module"}},
            ]
        },
    ),
}


def write(name: str, code: str, opts: dict) -> None:
    res = json.loads(tracer.run_trace(code, json.dumps(opts)))
    res["stats"]["durationMs"] = 0  # keep fixtures stable
    text = json.dumps({"code": code, "options": opts, "wire": res}, indent=1) + "\n"
    target = OUT / f"{name}.json"
    for attempt in range(5):  # Windows occasionally refuses a write right after a scan/lock (Errno 22)
        try:
            target.write_text(text, encoding="utf-8", newline="\n")
            break
        except OSError:
            if attempt == 4:
                raise
            time.sleep(0.2)
    print("wrote", name, "->", res["status"], len(res["steps"]), "steps")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (code, opts) in CASES.items():
        write(name, code, opts)
    for p in json.loads((PRESETS / "presets.json").read_text(encoding="utf-8")):
        code = (PRESETS / p["file"]).read_text(encoding="utf-8")
        write(f"preset-{p['id']}", code, {"stdin": p.get("stdin", [])})


if __name__ == "__main__":
    main()
