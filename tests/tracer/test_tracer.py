import pytest
from conftest import frame_name, lines, trace, writes

DIGIT_SUM = """\
n = 1234
total = 0
while n > 0:
    total = total + n % 10
    n = n // 10
print(total)
"""

FACT = """\
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
r = fact(3)
"""


# ───────────── basics & post-state ─────────────


def test_rows_are_post_state():
    res = trace("n = 12\ntotal = 0\ntotal = total + n % 10\n")
    assert res["status"] == "ok"
    assert lines(res) == [1, 2, 3]
    assert [writes(s) for s in res["steps"]] == [{"n": "12"}, {"total": "0"}, {"total": "2"}]


def test_condition_lines_appear_with_no_writes():
    res = trace(DIGIT_SUM)
    assert res["status"] == "ok"
    cond_rows = [s for s in res["steps"] if s["ln"] == 3]
    assert len(cond_rows) == 5  # four true tests + the final false one
    assert all("w" not in s for s in cond_rows)


def test_digit_sum_result_and_output_on_print_row():
    res = trace(DIGIT_SUM)
    assert res["stdout"] == "10\n"
    assert [s["o"] for s in res["steps"] if "o" in s] == ["10\n"]
    assert res["steps"][-1]["ln"] == 6  # the print row is finalised by the module return


def test_variable_meta_in_first_appearance_order():
    res = trace(DIGIT_SUM)
    assert [(v["columnId"], v["firstStep"]) for v in res["variables"]] == [("<module>:n", 0), ("<module>:total", 1)]
    assert not any(v["ephemeral"] for v in res["variables"])


def test_callables_modules_and_dunders_are_hidden():
    res = trace("import math\ndef f():\n    pass\nx = 1\n")
    assert [v["name"] for v in res["variables"]] == ["x"]
    res = trace("def f():\n    pass\nx = 1\n", showCallables=True)
    assert {v["name"] for v in res["variables"]} == {"f", "x"}


# ───────────── frames, calls, returns ─────────────


def test_call_rows_carry_parameters_and_label():
    res = trace(FACT)
    calls = [s for s in res["steps"] if s["k"] == "c"]
    assert [writes(c) for c in calls] == [{"n": "3"}, {"n": "2"}, {"n": "1"}]
    assert [c["ln"] for c in calls] == [1, 1, 1]
    labels = [f["argsLabel"] for f in res["frames"] if f["name"] == "fact"]
    assert labels == ["fact(n=3)", "fact(n=2)", "fact(n=1)"]


def test_recursion_return_rows_in_unwinding_order_with_values():
    res = trace(FACT)
    rets = [s for s in res["steps"] if s["k"] == "r"]
    assert [r["r"]["v"] for r in rets] == ["1", "2", "6"]
    assert [r["ln"] for r in rets] == [3, 4, 4]
    # the module's `r = fact(3)` row comes AFTER all callee rows and shows r = 6
    assert res["steps"][-1]["ln"] == 5
    assert writes(res["steps"][-1]) == {"r": "6"}


def test_call_stack_and_depth_in_each_step():
    res = trace(FACT)
    depths = {f["id"]: f["depth"] for f in res["frames"]}
    assert [depths[f["id"]] for f in res["frames"]] == [0, 1, 2, 3]
    deepest = max(res["steps"], key=lambda s: len(s["stk"]))
    assert len(deepest["stk"]) == 4  # module + 3 calls
    assert res["functions"] == ["fact"]


def test_implicit_return_has_no_return_value():
    res = trace("def f():\n    x = 1\nf()\n")
    assert not any(s["k"] == "r" for s in res["steps"])


def test_nested_function_and_method_names():
    code = "def outer():\n    def inner():\n        return 1\n    return inner()\nclass A:\n    def m(self):\n        return 2\nouter()\nA().m()\n"
    res = trace(code)
    assert res["functions"] == ["outer", "outer.inner", "A.m"]


def test_class_bodies_and_lambdas_and_genexprs_emit_no_rows():
    res = trace("class A:\n    z = 1\nf = lambda v: v + 1\nt = sum(i for i in range(3))\ny = f(1)\n")
    assert res["status"] == "ok"
    assert {frame_name(res, s) for s in res["steps"]} == {"<module>"}


def test_callee_global_rebinding_is_recorded():
    res = trace("g = 1\ndef f():\n    global g\n    g = 2\nf()\n")
    last_f_row = [s for s in res["steps"] if frame_name(res, s) == "f" and s["ln"] == 4][0]
    assert writes(last_f_row) == {"g": "2"}


# ───────────── stdout attribution ─────────────


def test_print_inside_callee_lands_on_callee_row():
    res = trace("def hi():\n    print('a')\nhi()\nprint('b')\n")
    by_line = {(frame_name(res, s), s["ln"]): s.get("o", "") for s in res["steps"] if s["k"] == "l"}
    assert by_line[("hi", 2)] == "a\n"
    assert by_line[("<module>", 4)] == "b\n"


def test_print_without_newline_and_multiple_prints_per_line():
    res = trace("print('a', end='')\nprint('b'); print('c')\n")
    assert [s.get("o") for s in res["steps"]] == ["a", "b\nc\n"]


def test_stderr_is_captured_too():
    res = trace("import sys\nprint('oops', file=sys.stderr)\n")
    assert res["stdout"] == "oops\n"


# ───────────── mutable snapshots ─────────────


def test_list_snapshots_are_not_aliased():
    res = trace("a = [1, 2]\na.append(3)\na[0] = 9\n")
    vals = [[x["v"] for x in w["a"]["items"]] for w in map(writes, res["steps"]) if "a" in w]
    assert vals == [["1", "2"], ["1", "2", "3"], ["9", "2", "3"]]


def test_value_shapes():
    res = trace("t = (1,)\nd = {'k': [True, None]}\ns = {2}\nf = 0.1 + 0.2\nu = 'hi'\n")
    w = {}
    for s in res["steps"]:
        w.update(writes(s))
    assert w["t"]["k"] == "tuple" and w["t"]["items"][0] == {"k": "int", "v": "1"}
    assert w["d"]["entries"][0][1]["items"] == [{"k": "bool", "v": True}, {"k": "none"}]
    assert w["s"]["k"] == "set"
    assert w["f"] == "0.30000000000000004"
    assert w["u"] == "hi"


def test_bool_is_not_confused_with_int():
    res = trace("x = True\ny = 1\n")
    assert res["steps"][0]["w"][0][2] == {"k": "bool", "v": True}
    assert res["steps"][1]["w"][0][2] == {"k": "int", "v": "1"}


def test_cycles_do_not_recurse_forever():
    res = trace("a = []\na.append(a)\n")
    assert res["status"] == "ok"
    inner = res["steps"][1]["w"][0][2]["items"][0]
    assert inner["k"] == "cycle"


def test_aliases_share_a_ref():
    res = trace("a = [1]\nb = a\n")
    ref_a = res["steps"][0]["w"][0][2]["ref"]
    assert res["steps"][1]["w"][0][2]["ref"] == ref_a


def test_value_limits_truncate():
    res = trace("xs = list(range(500))\ns = 'z' * 1000\n", valueLimits={"maxItems": 5, "maxDepth": 4, "maxStringLength": 10})
    xs = res["steps"][0]["w"][0][2]
    assert len(xs["items"]) == 5 and xs["truncated"] == 500
    s = res["steps"][1]["w"][0][2]
    assert len(s["v"]) == 10 and s["truncated"] == 1000


def test_instances_are_serialised_as_objects():
    res = trace("class P:\n    def __init__(self):\n        self.x = 1\np = P()\n")
    obj = next(w["p"] for w in map(writes, res["steps"]) if "p" in w)
    assert obj["k"] == "object" and obj["type"] == "P" and obj["fields"]["x"] == {"k": "int", "v": "1"}


def test_hostile_repr_does_not_break_tracing():
    code = "class Bad:\n    def __repr__(self):\n        raise RuntimeError('no')\nclass W:\n    __slots__ = ()\nb = W()\nx = 1\n"
    res = trace(code)
    assert res["status"] == "ok"


# ───────────── errors ─────────────


def test_syntax_error_reports_position():
    res = trace("x = 1\nif x\n    pass\n")
    assert res["status"] == "syntax-error"
    assert res["error"]["line"] == 2
    assert "SyntaxError" in res["error"]["message"]
    assert res["steps"] == []


def test_indentation_error_is_a_syntax_error():
    res = trace("def f():\npass\n")
    assert res["status"] == "syntax-error"
    assert res["error"]["type"] == "IndentationError"


def test_runtime_error_keeps_partial_trace_and_marks_row():
    res = trace("a = 1\nb = a / 0\nc = 3\n")
    assert res["status"] == "runtime-error"
    assert res["error"]["type"] == "ZeroDivisionError"
    assert res["error"]["line"] == 2
    assert lines(res) == [1, 2]
    last = res["steps"][-1]
    assert last["k"] == "x" and last["x"] == {"t": "ZeroDivisionError", "m": "division by zero", "c": False}


def test_traceback_lists_user_frames_only():
    res = trace("def f():\n    return 1 / 0\ndef g():\n    return f()\ng()\n")
    assert [t["functionName"] for t in res["error"]["traceback"]] == ["<module>", "g", "f"]


def test_caught_exception_is_flagged_caught():
    res = trace("try:\n    1 / 0\nexcept ZeroDivisionError:\n    y = 1\n")
    assert res["status"] == "ok"
    row = next(s for s in res["steps"] if s["ln"] == 2)
    assert row["x"]["c"] is True and row["k"] == "l"


def test_for_loops_do_not_report_stopiteration():
    res = trace("for i in range(2):\n    pass\n")
    assert not any("x" in s for s in res["steps"])


def test_sys_exit_is_not_an_error():
    res = trace("import sys\nx = 1\nsys.exit(0)\n")
    assert res["status"] == "ok"


# ───────────── limits & aborts ─────────────


def test_step_limit_stops_infinite_loop_with_partial_trace():
    res = trace("i = 0\nwhile True:\n    i += 1\n", maxSteps=20)
    assert res["status"] == "step-limit"
    assert 0 < len(res["steps"]) <= 20
    assert res["error"]["line"] in (2, 3)
    assert res["stats"]["rawSteps"] == 21


def test_step_limit_boundary_exact_fit_is_ok():
    res = trace("a = 1\nb = 2\nc = 3\n", maxSteps=3)
    assert res["status"] == "ok"


def test_timeout_stops_busy_loop():
    res = trace("i = 0\nwhile True:\n    i += 1\n", maxSteps=10**9, timeoutMs=50)
    assert res["status"] == "timeout"


def test_depth_limit_stops_runaway_recursion():
    res = trace("def f(n):\n    return f(n + 1)\nf(0)\n", maxCallDepth=10)
    assert res["status"] == "runtime-error"
    assert res["error"]["type"] == "RecursionError"
    assert len(res["frames"]) <= 12


def test_bare_except_cannot_swallow_the_abort():
    code = "i = 0\nwhile True:\n    try:\n        i += 1\n    except:\n        pass\n"
    res = trace(code, maxSteps=30)
    assert res["status"] == "step-limit"
    assert res["stats"]["rawSteps"] <= 40  # stopped promptly, not run to completion untraced


def test_except_baseexception_tuple_is_guarded_too():
    code = "while True:\n    try:\n        pass\n    except (ValueError, BaseException):\n        pass\n"
    assert trace(code, maxSteps=30)["status"] == "step-limit"


def test_except_exception_still_works_normally():
    res = trace("try:\n    1 / 0\nexcept Exception:\n    y = 1\n")
    assert res["status"] == "ok"


def test_runs_do_not_leak_trace_or_stdout_state():
    import sys

    trace("print('x')\n")
    assert sys.gettrace() is None
    assert sys.stdout is sys.__stdout__ or hasattr(sys.stdout, "write")
    res = trace("print('y')\n")
    assert res["stdout"] == "y\n"


# ───────────── input() & imports ─────────────


def test_input_consumes_stdin_and_echoes_it():
    res = trace("name = input('Name? ')\nprint(name)\n", stdin=["Ada"])
    assert res["status"] == "ok"
    assert writes(res["steps"][0]) == {"name": "Ada"}
    assert res["steps"][0]["o"] == "Name? Ada\n"


def test_input_exhausted_awaits_input():
    res = trace("a = input('one? ')\nb = input('two? ')\n", stdin=["x"])
    assert res["status"] == "awaiting-input"
    assert res["inputRequest"] == {"prompt": "two? ", "consumedCount": 1}


def test_input_without_stdin_awaits_input():
    res = trace("x = int(input('n: '))\n")
    assert res["status"] == "awaiting-input"
    assert res["inputRequest"]["consumedCount"] == 0


def test_blocked_imports():
    res = trace("import js\n")
    assert res["status"] == "runtime-error"
    assert res["error"]["type"] == "ImportError"
    assert trace("import math\nx = math.pi\n")["status"] == "ok"


def test_random_is_seeded_and_repeatable():
    code = "import random\nx = random.randint(1, 10**9)\n"
    a = trace(code, randomSeed=7)
    b = trace(code, randomSeed=7)
    c = trace(code, randomSeed=8)
    assert writes(a["steps"][1]) == writes(b["steps"][1]) != writes(c["steps"][1])


# ───────────── known gaps (M2) — strict so they fail loudly when fixed ─────────────


def test_callee_mutation_of_a_global_list_shows_in_callee_row():
    res = trace("def bump(a):\n    a[0] = 99\nnums = [1, 2]\nbump(nums)\nx = 1\n")
    bump_row = next(s for s in res["steps"] if frame_name(res, s) == "bump" and s["ln"] == 2)
    assert any(name == "nums" for _fid, name, _v in bump_row.get("w", []))


@pytest.mark.xfail(strict=True, reason="M2: re-serialise mutable bindings in suspended caller FUNCTION frames")
def test_callee_mutation_of_a_caller_functions_list_shows_in_callee_row():
    code = "def bump(a):\n    a[0] = 99\ndef main():\n    nums = [1, 2]\n    bump(nums)\nmain()\n"
    res = trace(code)
    main_fid = next(f["id"] for f in res["frames"] if f["name"] == "main")
    bump_row = next(s for s in res["steps"] if frame_name(res, s) == "bump" and s["ln"] == 2)
    assert (main_fid, "nums") in [(f, n) for f, n, _v in bump_row.get("w", [])]


@pytest.mark.xfail(strict=True, reason="M2: static assignment info makes re-assigning an unchanged value a write")
def test_reassigning_same_value_counts_as_a_write():
    res = trace("found = False\nfound = False\n")
    assert "w" in res["steps"][1]


@pytest.mark.xfail(strict=True, reason="M2: comprehension targets should be flagged ephemeral")
def test_comprehension_variable_is_ephemeral():
    res = trace("sq = [i * i for i in range(3)]\n")
    assert next(v for v in res["variables"] if v["name"] == "i")["ephemeral"]
