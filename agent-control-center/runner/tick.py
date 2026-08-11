#!/usr/bin/env python3
"""Execute exactly one job by id. DSM Task Scheduler calls this per job.

    python3 tick.py <job-id> [--source schedule|manual] [--dry-run]

DSM owns the schedule (one Task Scheduler entry per job fires this at the right
time). The same entrypoint backs a future "Run now" button. On each run it:
  1. records a `runs` row (running -> success/error),
  2. updates the job's state (last_status, last_run_at, last_duration_ms),
  3. adds a `results` inbox item per the job's output.notifyOn, bumping unread.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime

import config
import runners
import store


def _utcnow() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _should_notify(notify_on: str, status: str) -> bool:
    notify_on = (notify_on or "always").lower()
    if notify_on == "never":
        return False
    if notify_on == "onError":
        return status == "error"
    # 'always' and 'onChange' both surface a result in the MVP (no prior-diff yet).
    return True


def run_job(job_id: str, source: str, dry_run: bool) -> int:
    store.init_db()
    conn = store.connect()
    try:
        job = store.get_job(conn, job_id)
        if job is None:
            print("[tick] job not found: %s" % job_id)
            return 1
        if source == "schedule" and not job["enabled"]:
            print("[tick] job disabled, skipping: %s" % job_id)
            return 0

        cfg = job["config"]
        task = cfg.get("task", {})
        secrets = cfg.get("secrets", [])
        runner = cfg.get("runner", job["runner"])
        max_retries = int(task.get("maxRetries", 0))

        run_id = store.start_run(conn, job_id, source)
        store.update_job_state(conn, job_id, "running", _utcnow(), None)

        result = {"status": "error", "output": "", "durationMs": 0, "error": "not run"}
        for attempt in range(max_retries + 1):
            if attempt:
                print("[tick] retry %d/%d" % (attempt, max_retries))
            result = runners.run(runner, task, secrets, dry_run)
            if result.get("status") == "success":
                break

        store.finish_run(conn, run_id, result)

        status = result.get("status", "error")
        ran_at = _utcnow()
        notify = _should_notify(cfg.get("output", {}).get("notifyOn"), status)
        add_unread = 1 if notify else 0
        store.update_job_state(conn, job_id, status, ran_at,
                               result.get("durationMs"), add_unread=add_unread)

        if notify:
            title = "%s — %s" % (job["name"], status)
            preview = (result.get("output") or result.get("error") or "")[:280]
            store.add_result(conn, job_id, title, preview)

        print("[tick] %s -> %s (%sms)"
              % (job_id, status, result.get("durationMs")))
        if status == "error":
            print("[tick] error: %s" % (result.get("error") or "")[:500])
        return 0 if status == "success" else 1
    finally:
        conn.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Run one Agent Control Center job.")
    ap.add_argument("job_id")
    ap.add_argument("--source", choices=["schedule", "manual"], default="schedule")
    ap.add_argument("--dry-run", action="store_true", help="canned output, no external API call")
    args = ap.parse_args()
    return run_job(args.job_id, args.source, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
