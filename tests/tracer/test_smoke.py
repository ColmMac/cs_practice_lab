"""M0 smoke tests on the throwaway prototype; replaced by real tracer tests in M1."""
import proto_tracer as pt


def test_straight_line_rows_are_post_state():
    status, steps = pt.run("n = 12\ntotal = 0\ntotal = total + n % 10\n")
    assert status == "ok"
    assert [s["line"] for s in steps] == [1, 2, 3]  # the last line is finalised by the module 'return' event
    assert steps[-1]["event"] == "return"
    assert steps[2]["changed"]["total"]["v"] == "2"


def test_step_limit_aborts_infinite_loop():
    status, steps = pt.run("i = 0\nwhile True:\n    i += 1\n", max_steps=10)
    assert status == "step-limit"
    assert len(steps) <= 10
