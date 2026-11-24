"""M2 tracer behaviour: caller-frame mutation, static writes, ephemeral names, branch outcomes, streaming."""

import json
import sys
import types

import tracer
from conftest import frame_name, trace, trace_unstreamed, writes

# ───────────── caller-frame mutation ─────────────


def _write_pairs(step):
    return [(f, n) for f, n, _v in step.get("w", [])]


def test_callee_mutation_of_a_caller_functions_list_shows_in_callee_row():
    code = "def bump(a):\n    a[0] = 99\ndef main():\n    nums = [1, 2]\n    bump(nums)\nmain()\n"
    res = trace(code)
    main_fid = next(f["id"] for f in res["frames"] if f["name"] == "main")
    bump_row = next(s for s in res["steps"] if frame_name(res, s) == "bump" and s["ln"] == 2)
    assert (main_fid, "nums") in _write_pairs(bump_row)


def test_mutation_is_reported_once_not_on_every_later_row():
    code = "def bump(a):\n    a[0] = 99\n    b = 1\n    c = 2\ndef main():\n    nums = [1, 2]\n    bump(nums)\nmain()\n"
    res = trace(code)
    main_fid = next(f["id"] for f in res["frames"] if f["name"] == "main")
    hits = [s for s in res["steps"] if (main_fid, "nums") in _write_pairs(s)]
    # once when main assigns it, once when bump mutates it; the later bump rows do not repeat it
    assert len(hits) == 2


# ───────────── static writes ─────────────


def test_reassigning_same_value_counts_as_a_write():
    res = trace("found = False\nfound = False\n")
    assert writes(res["steps"][1]) == {"found": False}


def test_augmented_assignment_of_same_value_is_a_write():
    res = trace("x = 5\nx += 0\n")
    assert writes(res["steps"][1]) == {"x": "5"}


def test_exhausted_for_loop_does_not_rewrite_its_target():
    res = trace("for c in [7, 8]:\n    pass\n")
    header = [s for s in res["steps"] if s["ln"] == 1]
    assert [s.get("b") for s in header] == [True, True, False]
    assert "w" not in header[-1]  # the exhausting test binds nothing


def test_for_header_with_unchanged_target_is_still_written_when_body_is_entered():
    res = trace("for c in [1, 1]:\n    pass\n")
    header = [s for s in res["steps"] if s["ln"] == 1]
    assert [("w" in s) for s in header] == [True, True, False]


def test_non_assigning_lines_have_no_writes():
    res = trace("x = 1\nprint(x)\nif x:\n    pass\n")
    assert all("w" not in s for s in res["steps"] if s["ln"] in (2, 3))


def test_comprehension_only_names_are_ephemeral():
    res = trace("sq = [j * j for j in range(3)]\n")
    assert next(v for v in res["variables"] if v["name"] == "j")["ephemeral"] is True
    assert next(v for v in res["variables"] if v["name"] == "sq")["ephemeral"] is False


def test_a_name_that_is_also_assigned_normally_is_not_ephemeral():
    res = trace("sq = [i * i for i in range(3)]\ni = 7\n")
    assert next(v for v in res["variables"] if v["name"] == "i")["ephemeral"] is False


# ───────────── branch outcomes ─────────────

BRANCHES = """\
x = 3
if x > 5:
    y = 1
elif x > 1:
    y = 2
else:
    y = 3
i = 0
while i < 2:
    i += 1
for k in range(2):
    pass
"""


def _branch(res, ln):
    return [s.get("b") for s in res["steps"] if s["ln"] == ln]


def test_if_elif_outcomes():
    res = trace(BRANCHES)
    assert _branch(res, 2) == [False]  # x > 5 is false: body skipped
    assert _branch(res, 4) == [True]  # elif x > 1 is true: body entered


def test_while_outcome_per_test():
    assert _branch(trace(BRANCHES), 9) == [True, True, False]


def test_for_outcome_per_iteration_and_exhaustion():
    assert _branch(trace(BRANCHES), 11) == [True, True, False]


def test_non_header_lines_have_no_branch_info():
    res = trace(BRANCHES)
    assert all("b" not in s for s in res["steps"] if s["ln"] in (1, 3, 5, 8, 10))


def test_inline_body_has_no_branch_info():
    res = trace("x = 1\nif x: y = 2\n")
    assert all("b" not in s for s in res["steps"])


def test_exception_in_condition_has_no_branch_info():
    res = trace("x = 0\nif 1 / x:\n    pass\n")
    assert all("b" not in s for s in res["steps"] if s["ln"] == 2)


def test_recursive_branch_outcomes_ignore_callee_lines():
    code = "def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nf(3)\n"
    res = trace(code)
    assert [s.get("b") for s in res["steps"] if s["ln"] == 2] == [False, False, True]


# ───────────── streaming ─────────────


def test_streaming_emits_chunks_and_merges_to_the_unstreamed_trace():
    code = "total = 0\nfor i in range(300):\n    total += i\n"
    streamed = trace(code, maxSteps=5000)
    plain = trace_unstreamed(code, maxSteps=5000)
    assert streamed["chunks"] >= 2
    assert streamed["steps"] == plain["steps"]
    assert streamed["frames"] == plain["frames"]
    assert streamed["variables"] == plain["variables"]
    assert [s["i"] for s in streamed["steps"]] == list(range(len(streamed["steps"])))


def test_chunks_are_incremental_not_cumulative():
    chunks = []
    tracer.run_trace("for i in range(250):\n    pass\n", json.dumps({"maxSteps": 5000}), chunks.append)
    parts = [json.loads(c) for c in chunks]
    assert all(len(p["steps"]) == 1 for p in parts)  # each finished row is sent once, as soon as it is done
    assert sum(len(p["steps"]) for p in parts) < 505


def test_frames_are_streamed_exactly_once_and_progress_advances():
    chunks = []
    code = "def f(i):\n    return i\nfor i in range(150):\n    f(i)\n"
    tracer.run_trace(code, json.dumps({"maxSteps": 5000}), chunks.append)
    parts = [json.loads(c) for c in chunks]
    ids = [f["id"] for p in parts for f in p["frames"]]
    assert len(ids) == len(set(ids))
    assert parts[-1]["rawSteps"] > parts[0]["rawSteps"]


def test_rows_before_a_blocking_call_are_already_streamed(monkeypatch):
    """If a line blocks inside C and the worker is killed, every earlier row must already be delivered."""
    received: list[str] = []
    seen: list[int] = []
    probe = types.ModuleType("tt_probe")
    probe.probe = lambda: seen.append(sum(len(json.loads(c)["steps"]) for c in received))
    monkeypatch.setitem(sys.modules, "tt_probe", probe)

    tracer.run_trace("import tt_probe\na = 1\nb = 2\ntt_probe.probe()\n", "{}", received.append)

    assert seen == [3]  # lines 1-3 are complete while line 4 (the "blocking" call) is running
    # and the chunk delivered just before it blocked says which line is running
    assert json.loads(received[2])["line"] == 4


def test_every_chunk_names_the_line_that_is_executing():
    chunks = []
    tracer.run_trace("a = 1\nb = 2\nc = 3\n", "{}", chunks.append)
    assert [json.loads(c)["line"] for c in chunks] == [2, 3, 3]  # the last row is closed by the module return


def test_aborted_runs_deliver_everything_recorded_so_far():
    res = trace("i = 0\nwhile True:\n    i += 1\n", maxSteps=250)
    assert res["status"] == "step-limit"
    assert res["chunks"] >= 1
    assert len(res["steps"]) >= 240


# ───────────── robustness ─────────────


def test_generators_do_not_break_tracing():
    res = trace("def g():\n    yield 1\n    yield 2\nt = 0\nfor v in g():\n    t += v\n")
    assert res["status"] == "ok"
    t_values = [writes(s)["t"] for s in res["steps"] if "t" in writes(s)]
    assert t_values[-1] == "3"


def test_nested_data_mutation_is_visible_in_the_row():
    res = trace("grid = [[0, 0], [0, 0]]\ngrid[1][0] = 5\n")
    final = writes(res["steps"][-1])["grid"]
    assert final["items"][1]["items"][0] == {"k": "int", "v": "5"}


def test_time_limit_applies_inside_a_function():
    res = trace("def f(n):\n    while True:\n        pass\nf(1)\n", maxSteps=10**9, timeoutMs=50)
    assert res["status"] == "timeout"
