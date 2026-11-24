import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "languages" / "python"))

import tracer  # noqa: E402


def trace(code: str, **opts) -> dict:
    """Run code through the tracer WITH streaming (as the worker does) and return the merged result.

    ``res["chunks"]`` is how many chunks were streamed before the final tail.
    """
    chunks: list[str] = []
    res = json.loads(tracer.run_trace(code, json.dumps(opts), chunks.append))
    parts = [json.loads(c) for c in chunks]
    for key in ("steps", "frames", "variables"):
        res[key] = [x for p in parts for x in p[key]] + res[key]
    res["chunks"] = len(parts)
    return res


def trace_unstreamed(code: str, **opts) -> dict:
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
