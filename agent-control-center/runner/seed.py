#!/usr/bin/env python3
"""Load every jobs/*.json config into the SQLite store (idempotent).

Run after adding or editing a job config:
    python3 seed.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

import config
import store


def main() -> int:
    store.init_db()
    conn = store.connect()
    try:
        paths = sorted(glob.glob(os.path.join(config.JOBS_DIR, "*.json")))
        if not paths:
            print("[seed] no job configs found in %s" % config.JOBS_DIR)
            return 0
        for path in paths:
            try:
                with open(path, "r") as fh:
                    cfg = json.load(fh)
            except (OSError, ValueError) as exc:
                print("[seed] skip %s: %s" % (path, exc))
                continue
            if not cfg.get("id"):
                print("[seed] skip %s: missing 'id'" % path)
                continue
            store.upsert_job(conn, cfg)
            flag = "" if cfg.get("enabled") else "  (disabled)"
            print("[seed] loaded %-20s %s%s"
                  % (cfg["id"], cfg.get("runner", "nas-python"), flag))
        print("[seed] done")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
