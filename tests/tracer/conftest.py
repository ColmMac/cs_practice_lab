import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "languages" / "python"))

import tracer  # noqa: E402


def trace(code: str, **opts) -> dict:
    """Run code through the tracer and return the parsed result."""
    return json.loads(tracer.run_trace(code, json.dumps(opts)))


def lines(res: dict) -> list[int]:
    return [s["ln"] for s in res["steps"]]


def writes(step: dict) -> dict:
    """{name: value-or-Value} for a step's writes; scalars are unwrapped for readable asserts."""
    out = {}
    for _fid, name, val in step.get("w", []):
        out[name] = val["v"] if "v" in val else val
    return out


def frame_name(res: dict, step: dict) -> str:
    return next(f["name"] for f in res["frames"] if f["id"] == step["f"])
