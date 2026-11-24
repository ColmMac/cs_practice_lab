"""Watch expressions: safe validation, evaluation per step, scopes, and no side effects on the program."""

import json

import pytest
import tracer
from conftest import trace, trace_unstreamed


def watch(expr, scope=None, wid="w"):
    return {"id": wid, "expr": expr, "scope": scope or {"kind": "current"}}


def series(res, wid="w"):
    """Per-step watch result with unchanged results carried forward (what the host does)."""
    cur, out = None, []
    for s in res["steps"]:
        cur = s.get("wt", {}).get(wid, cur)
        out.append(cur)
    return out


def scalar(r):
    """Unwrap an ok int/bool/str result to a Python value; leave failures as dicts."""
    if not r or not r.get("ok"):
        return r
    v = r["value"]
    if v["k"] == "int":
        return int(v["v"])
    return v.get("v", v["k"])


def validate(expr):
    return json.loads(tracer.validate_watch(expr))


# ───────────── validation ─────────────


@pytest.mark.parametrize(
    "expr",
    [
        "arr[i]", "len(items)", "i < n", "a + b * 2", "x if y else z", "items.count(3)", "d.get('k')",
        "sorted(items)[0]", "-x", "not done", "'a' in s", "xs[1:3]", "min(a, b) == max(a, b)", "(a, b)",
        "s.upper().startswith('A')", "x // 2 % 3", "isinstance(x, int) and x > 0", "sum(xs) / len(xs)",
    ],
)  # fmt: skip
def test_valid_expressions_are_accepted(expr):
    assert validate(expr) == {"ok": True}


def test_mutating_method_is_rejected_with_a_helpful_message():
    r = validate("arr.pop()")
    assert r["ok"] is False
    assert ".pop()" in r["message"]
    assert "change your program's state" in r["message"]
    assert "count" in r["message"]  # points at what IS allowed


@pytest.mark.parametrize("method", ["append", "remove", "sort", "reverse", "clear", "update", "add", "extend", "insert"])
def test_every_mutating_method_is_rejected(method):
    assert validate(f"x.{method}(1)")["ok"] is False


def test_unknown_methods_and_functions_are_rejected():
    assert "isn't allowed" in validate("x.frobnicate()")["message"]
    assert "can't call f()" in validate("f(x)")["message"]
    assert "can't call open()" in validate("open('file')")["message"]
    assert "can't call print()" in validate("print(x)")["message"]
    assert "can't call input()" in validate("input()")["message"]


@pytest.mark.parametrize(
    "expr, fragment",
    [
        ("lambda: 1", "Lambdas"),
        ("[v for v in xs]", "Comprehensions"),
        ("{v for v in xs}", "Comprehensions"),
        ("(y := 3)", "Assignments"),
        ("f'{x}'", "f-strings"),
        ("__import__('os')", "__"),
        ("x.__class__", "Private"),
        ("x._secret", "Private"),
        ("", "Type an expression"),
        ("   ", "Type an expression"),
        ("1 +", "Not a valid expression"),
        ("x = 1", "Not a valid expression"),
    ],
)  # fmt: skip
def test_rejection_messages_explain_why(expr, fragment):
    r = validate(expr)
    assert r["ok"] is False
    assert fragment in r["message"], r["message"]


def test_calling_through_a_call_result_is_rejected():
    assert validate("f(1)(2)")["ok"] is False
    assert validate("(lambda: 1)()")["ok"] is False


# ───────────── evaluation ─────────────


def outcome(r):
    """Compact form for exact assertions: the value if ok, else the failure reason."""
    return scalar(r) if r and r.get("ok") else (r or {}).get("reason")


def test_condition_watch_changes_with_the_loop():
    code = "n = 3\ni = 0\nwhile i < n:\n    i += 1\n"
    res = trace(code, watches=[watch("i < n")])
    # (line, value) per row, post-state: `i` doesn't exist after line 1; the test turns False when i reaches 3
    assert [(s["ln"], outcome(r)) for s, r in zip(res["steps"], series(res))] == [
        (1, "not-in-scope"), (2, True), (3, True), (4, True), (3, True), (4, True), (3, True), (4, False), (3, False),
    ]  # fmt: skip


def test_value_watch_tracks_a_list_element():
    code = "arr = [10, 20, 30]\ni = 0\nwhile i < 3:\n    i += 1\n"
    res = trace(code, watches=[watch("arr[i - 1]")])
    # i = 0 gives arr[-1] (Python's negative index), then 10, 20, 30 as i counts up
    assert [(s["ln"], outcome(r)) for s, r in zip(res["steps"], series(res))] == [
        (1, "not-in-scope"), (2, 30), (3, 30), (4, 10), (3, 10), (4, 20), (3, 20), (4, 30), (3, 30),
    ]  # fmt: skip


def test_only_changes_are_emitted_but_carry_forward_gives_every_step_a_value():
    code = "x = 5\ny = 1\nz = 2\nw = 3\n"
    res = trace(code, watches=[watch("x")])
    emitted = [s for s in res["steps"] if "wt" in s]
    assert len(emitted) == 1  # rows are post-state, so x = 5 already holds on the first row and never changes
    assert [outcome(r) for r in series(res)] == [5] * len(res["steps"])  # ...yet every step has a value


def test_not_in_scope_is_reported_for_missing_names():
    res = trace("a = 1\n", watches=[watch("nope + 1")])
    r = series(res)[0]
    assert r["ok"] is False and r["reason"] == "not-in-scope"


def test_runtime_errors_are_reported_not_raised():
    res = trace("d = {}\nx = 1\n", watches=[watch("d['missing']"), watch("1 / 0", wid="z")])
    assert series(res)[-1]["reason"] == "error" and "KeyError" in series(res)[-1]["message"]
    assert series(res, "z")[-1]["reason"] == "error" and "ZeroDivisionError" in series(res, "z")[-1]["message"]
    assert res["status"] == "ok"  # the program itself is unaffected


def test_rejected_watches_report_once_and_the_program_runs_normally():
    res = trace("a = [1]\nb = 2\n", watches=[watch("a.pop()")])
    assert res["status"] == "ok"
    emitted = [s["wt"]["w"] for s in res["steps"] if "wt" in s]
    assert len(emitted) == 1 and emitted[0]["reason"] == "rejected"
    assert "pop" in emitted[0]["message"]


def test_several_watches_are_independent():
    res = trace("x = 1\nx = 2\n", watches=[watch("x", wid="a"), watch("x * 10", wid="b")])
    assert scalar(series(res, "a")[-1]) == 2 and scalar(series(res, "b")[-1]) == 20


def test_watch_values_are_serialised_like_variables():
    res = trace("xs = [1, 2]\nys = 0\n", watches=[watch("xs")])
    last = series(res)[-1]
    assert last["value"]["k"] == "list" and [i["v"] for i in last["value"]["items"]] == ["1", "2"]


# ───────────── scopes ─────────────

FN = "def f(n):\n    m = n * 2\n    return m\ntotal = 0\ntotal = f(3)\n"


def test_current_scope_follows_the_active_frame():
    res = trace(FN, watches=[watch("n")])
    in_f = [scalar(r) for s, r in zip(res["steps"], series(res)) if s["f"] != 0]
    assert 3 in in_f
    module_rows = [r for s, r in zip(res["steps"], series(res)) if s["f"] == 0 and s["ln"] == 4]
    assert module_rows[0]["reason"] == "not-in-scope"


def test_function_scope_sees_that_function_even_from_the_module_frame():
    res = trace(FN, watches=[watch("n", {"kind": "function", "name": "f"})])
    pairs = list(zip(res["steps"], series(res)))
    inside = [scalar(r) for s, r in pairs if s["f"] != 0]
    assert all(v == 3 for v in inside)
    before_call = [r for s, r in pairs if s["f"] == 0 and s["ln"] == 4]
    assert before_call[0]["reason"] == "not-in-scope"  # no live call of f yet


def test_function_scope_picks_the_innermost_recursive_call():
    code = "def f(n):\n    if n > 0:\n        f(n - 1)\nf(2)\n"
    res = trace(code, watches=[watch("n", {"kind": "function", "name": "f"})])
    seen = [scalar(r) for r in series(res) if r and r.get("ok")]
    assert 2 in seen and 1 in seen and 0 in seen


def test_module_scope_reads_globals_from_inside_a_function():
    code = "g = 7\ndef f():\n    x = 1\n    return x\nf()\n"
    res = trace(code, watches=[watch("g", {"kind": "module"})])
    inside = [scalar(r) for s, r in zip(res["steps"], series(res)) if s["f"] != 0]
    assert inside and all(v == 7 for v in inside)


# ───────────── safety: a watch must never change the program ─────────────


def test_a_watch_cannot_change_program_state():
    code = "arr = [1, 2, 3]\nx = 0\nprint(len(arr))\n"
    plain = trace(code)
    for expr in ["arr.pop()", "arr.append(9)", "arr.sort()", "arr.clear()"]:
        res = trace(code, watches=[watch(expr)])
        assert res["stdout"] == plain["stdout"] == "3\n"
        assert [s.get("w") for s in res["steps"]] == [s.get("w") for s in plain["steps"]]


def test_user_defined_methods_are_blocked_at_run_time():
    code = (
        "class Counter:\n    def __init__(self):\n        self.n = 0\n"
        "    def count(self):\n        self.n += 1\n        return self.n\n"
        "c = Counter()\nz = 1\nprint(c.n)\n"
    )
    res = trace(code, watches=[watch("c.count()")])  # `count` is on the allowlist, but c is a user object
    assert res["stdout"] == "0\n"  # the method never ran
    r = series(res)[-1]
    assert r["ok"] is False and r["reason"] == "error" and "can't call methods of Counter" in r["message"]


def test_builtin_methods_work_through_the_guard():
    res = trace("s = 'hello'\nxs = [1, 2, 2]\nk = 0\n", watches=[watch("s.upper()"), watch("xs.count(2)", wid="c")])
    assert scalar(series(res)[-1]) == "HELLO"
    assert scalar(series(res, "c")[-1]) == 2


def test_watches_do_not_consume_steps_or_change_the_trace():
    code = "total = 0\nfor i in range(5):\n    total += i\n"
    plain = trace(code)
    withw = trace(code, watches=[watch("total"), watch("i < 3", wid="b")])
    assert withw["stats"]["rawSteps"] == plain["stats"]["rawSteps"]
    strip = lambda r: [{k: v for k, v in s.items() if k != "wt"} for s in r["steps"]]  # noqa: E731
    assert strip(withw) == strip(plain)


def test_watches_survive_streaming_and_match_the_unstreamed_run():
    code = "t = 0\nfor i in range(60):\n    t += i\n"
    opts = {"maxSteps": 5000, "watches": [watch("t % 7")]}
    assert trace(code, **opts)["steps"] == trace_unstreamed(code, **opts)["steps"]


def test_a_slow_watch_still_respects_the_time_limit():
    res = trace("i = 0\nwhile True:\n    i += 1\n", maxSteps=10**9, timeoutMs=100, watches=[watch("sum(range(1000))")])
    assert res["status"] == "timeout"
