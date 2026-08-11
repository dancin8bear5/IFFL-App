"""cloud runner (stub): heavy agents (full Claude Code + connectors) on a VPS.

Not built for the MVP. When the first `cloud` agent lands, implement this to
invoke Claude Code headless on the chosen host (Fly.io / Cloud Run / VPS) —
e.g. SSH `claude -p "<prompt>"` or an HTTP call to a small runner service —
and return the standard result dict.
"""
from __future__ import annotations

from typing import Any, Dict, List


def run(task: Dict[str, Any], secrets: List[str], dry_run: bool) -> Dict[str, Any]:
    return {"status": "error", "output": "", "durationMs": 0,
            "error": "cloud runner not implemented yet (MVP is nas-python only). "
                     "Choose a host and wire runners/cloud.py."}
