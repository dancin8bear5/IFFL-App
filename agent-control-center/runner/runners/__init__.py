"""Runner seam.

A runner is WHERE a job executes. Each adapter exposes:
    run(task: dict, secrets: list, dry_run: bool) -> dict
with a result dict:
    { "status": "success"|"error", "output": str, "durationMs": int,
      "tokens": int|None, "costUsd": float|None, "error": str|None }

Swapping a job's `runner` field (nas-python -> cloud -> mac -> macmini) is the
one-line migration seam; nothing else changes.
"""
from __future__ import annotations

from typing import Any, Dict, List

from . import nas_python, cloud, mac

_REGISTRY = {
    "nas-python": nas_python.run,
    "cloud": cloud.run,
    "mac": mac.run,
}


def run(runner: str, task: Dict[str, Any], secrets: List[str], dry_run: bool) -> Dict[str, Any]:
    fn = _REGISTRY.get(runner)
    if fn is None:
        return {"status": "error", "output": "", "durationMs": 0,
                "error": "unknown runner: %r (expected nas-python|cloud|mac)" % runner}
    return fn(task, secrets, dry_run)
