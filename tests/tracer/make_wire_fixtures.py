"""Regenerates tests/fixtures/wire/*.json from the real tracer (consumed by the Vitest suite).

    npm run fixtures

Re-run after any change to tracer.py's output; review the diff, since it is the wire contract.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "languages" / "python"))
import tracer  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "wire"

CASES = {
    "digit-sum": ("n = 1234\ntotal = 0\nwhile n > 0:\n    digit = n % 10\n    total = total + digit\n    n = n // 10\nprint(total)\n", {}),
    "factorial": ("def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nresult = fact(3)\nprint(result)\n", {}),
    "zero-division": ("a = 1\nb = a / 0\n", {}),
    "infinite-loop": ("i = 0\nwhile True:\n    i += 1\n", {"maxSteps": 12}),
    "syntax-error": ("if x\n    pass\n", {}),
    "needs-input": ("name = input('Name? ')\nprint(name)\n", {}),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (code, opts) in CASES.items():
        res = json.loads(tracer.run_trace(code, json.dumps(opts)))
        res["stats"]["durationMs"] = 0  # keep fixtures stable
        (OUT / f"{name}.json").write_text(json.dumps({"code": code, "options": opts, "wire": res}, indent=1) + "\n")
        print("wrote", name, "->", res["status"], len(res["steps"]), "steps")


if __name__ == "__main__":
    main()
