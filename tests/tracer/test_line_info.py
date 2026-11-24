"""Static per-line info (PLAN.md §17.2 A) and the branch outcomes the Condition column is built from."""

from conftest import lines, trace


def branches(res: dict, line: int) -> list:
    return [s.get("b") for s in res["steps"] if s["ln"] == line]


def test_multi_line_while_condition():
    code = "i = 0\nn = 2\nfound = False\nwhile (i < n and\n       not found):\n    i += 1\nprint(i)\n"
    res = trace(code)
    # one row per evaluation, on the header line: no rows for the continuation line
    assert 5 not in lines(res)
    assert lines(res) == [1, 2, 3, 4, 6, 4, 6, 4, 7]
    assert branches(res, 4) == [True, True, False]


def test_multi_line_for_iterable_and_elif():
    code = "for x in [1,\n          2]:\n    if (x > 1 and\n            x > 2):\n        a = 1\n    elif (x ==\n          2):\n        a = 2\ndone = 1\n"
    res = trace(code)
    assert lines(res) == [1, 3, 6, 1, 3, 6, 8, 1, 9]
    assert branches(res, 1) == [True, True, False]
    assert branches(res, 3) == [False, False]
    assert branches(res, 6) == [False, True]
    assert res["lines"]["6"]["k"] == "elif"
    assert res["lines"]["1"]["e"]["t"] == "[1, 2]"


def test_walrus_on_a_continuation_line_is_still_a_write():
    code = "y = 1\nwhile (y < 3 and\n       (z := 5)):\n    y += 1\n"
    res = trace(code)
    headers = [s for s in res["steps"] if s["ln"] == 2]
    assert all(any(w[1] == "z" for w in s.get("w", [])) for s in headers[:2])


def test_endless_loop_inside_a_multi_line_header_still_stops():
    res = trace("while (True and\n       True): pass\n", maxSteps=20)
    assert res["status"] == "step-limit"


def test_elif_is_told_apart_from_else_if():
    code = "x = 3\nif x == 1:\n    a = 1\nelif x == 2:\n    a = 2\nelse:\n    if x == 3:\n        a = 3\n"
    info = trace(code)["lines"]
    assert [info[n]["k"] for n in ("2", "4", "7")] == ["if", "elif", "if"]


def test_one_line_body_has_no_branch_and_is_flagged():
    res = trace("x = 1\nif x: y = 2\nwhile x > 1: x -= 1\n")
    assert branches(res, 2) == [None]
    assert branches(res, 3) == [None]
    assert res["lines"]["2"]["ol"] is True
    assert res["lines"]["3"]["ol"] is True
    assert "ol" not in trace("if True:\n    pass\n")["lines"]["1"]


def test_header_that_raises_has_no_branch():
    res = trace("x = 1\nif 1 / 0:\n    x = 2\n")
    assert res["status"] == "runtime-error"
    assert branches(res, 2) == [None]


def test_while_true_ended_by_break_has_no_false_row():
    res = trace("i = 0\nwhile True:\n    i += 1\n    if i == 2:\n        break\n")
    assert False not in branches(res, 2)


def test_for_over_an_empty_list_is_one_false_row():
    assert branches(trace("for x in []:\n    pass\ny = 1\n"), 1) == [False]


def test_recursive_function_headers():
    res = trace("def f(n):\n    if n > 0:\n        f(n - 1)\n    return n\nf(2)\n")
    assert branches(res, 2) == [True, True, False]


def test_header_still_running_when_aborted_is_not_reported_false():
    # the `if` is suspended inside f() when the step limit hits: its outcome is unknown
    code = "def f():\n    while True:\n        pass\nif f():\n    x = 1\n"
    res = trace(code, maxSteps=10)
    assert res["status"] == "step-limit"
    assert branches(res, 4) == [None]


def info_of(code: str, line: int = 1) -> dict:
    return trace(code)["lines"][str(line)]


def test_templates_keep_literal_text_and_variable_reads():
    info = info_of("items = [1]\ni = 0\nfound = False\nwhile i < len(items) and not found:\n    i += 1\n", 4)
    assert info["k"] == "while"
    assert info["e"]["t"] == "i < len(items) and not found" and info["e"]["u"] is True
    assert info["e"]["p"] == ["", {"n": "i"}, " < len(", {"n": "items"}, ") and (not ", {"n": "found"}, ")"]
    assert [x["n"] for x in info["e"]["p"] if isinstance(x, dict)] == ["i", "items", "found"]


def test_statement_kinds_targets_and_expressions():
    code = (
        "count = 1\ncount += 1\nnums = [1, 2]\nnums[0], b = b, a = 2, 3\n"
        "print(count, nums[0])\nword = input()\nfor c in 'ab':\n    pass\n"
        "def g():\n    return count * 2\ng()\ncount *= count + 1\n"
    )
    info = trace(code, stdin=["hi"])["lines"]
    assert info["2"] == {"k": "augassign", "e": {"t": "count + 1", "p": ["", {"n": "count"}, " + 1"], "u": True}, "tg": ["count"]}
    assert info["4"]["tg"] == ["nums[0]", "b", "a"]
    assert info["5"]["k"] == "output"
    assert info["5"]["e"] == {"t": "count, nums[0]", "p": ["", {"n": "count"}, ", ", {"n": "nums"}, "[0]"], "u": True}
    assert info["6"] == {"k": "assign", "e": {"t": "input()", "p": ["input()"], "u": False}, "tg": ["word"], "in": True}
    assert info["7"]["k"] == "for" and info["7"]["tg"] == ["c"]
    assert info["9"] == {"k": "other"}
    assert info["10"]["k"] == "return"
    assert info["11"] == {"k": "other"}
    assert info["12"]["e"]["t"] == "count * (count + 1)"  # precedence is kept


def test_impure_expressions_are_marked():
    for expr in ("foo(1)", "xs.count(1)", "(y := 1)", "[v for v in xs]", "lambda: 1"):
        code = f"xs = []\ndef foo(a):\n    return a\nr = {expr}\n"
        assert info_of(code, 4)["e"]["u"] is False, expr
    assert info_of("r = len([1]) + max(1, 2)\n")["e"]["u"] is True


def test_first_statement_on_a_line_wins_and_big_expressions_are_omitted():
    assert info_of("a = 1; print(a)\n")["tg"] == ["a"]
    assert "e" not in info_of("x = '" + "a" * 250 + "'\n")
    assert "e" not in info_of("a = 1\nx = " + " + ".join(["a"] * 41) + "\n", 2)


def test_non_ascii_source_text_is_sliced_correctly():
    assert info_of("naïve = 'é'; x = 1\n")["e"]["t"] == "'é'"
    assert info_of("é = 1\nif é == 1:\n    pass\n", 2)["e"]["t"] == "é == 1"


def test_lines_are_capped():
    assert len(trace("x = 1\n" * 2100, maxSteps=3000)["lines"]) == 2000


def test_lines_are_streamed_in_the_first_chunk_only():
    import json

    import tracer

    chunks: list[str] = []
    final = json.loads(tracer.run_trace("a = 1\nb = 2\nc = 3\n", "{}", chunks.append))
    parts = [json.loads(c) for c in chunks]
    assert "lines" in parts[0] and all("lines" not in p for p in parts[1:])
    assert "lines" not in final
    assert "lines" in json.loads(tracer.run_trace("a = 1\n", "{}"))
