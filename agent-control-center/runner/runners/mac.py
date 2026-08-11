"""mac runner (stub): Wake-on-LAN + SSH `claude -p` to a Mac.

Not built for the MVP. Future `macmini` (~Aug 2027) is the same adapter pointed
at a different host. Implement to WoL the Mac, wait for SSH, run
`claude -p "<prompt>"`, capture stdout, and return the standard result dict.
`schedule.catchUpOnWake` only matters here.
"""
from __future__ import annotations

from typing import Any, Dict, List


def run(task: Dict[str, Any], secrets: List[str], dry_run: bool) -> Dict[str, Any]:
    return {"status": "error", "output": "", "durationMs": 0,
            "error": "mac runner not implemented yet (MVP is nas-python only)."}
