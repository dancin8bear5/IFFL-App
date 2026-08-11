"""SQLite store access layer. Stdlib sqlite3 only."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

import config


def _utcnow() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with open(config.SCHEMA_PATH, "r") as fh:
        ddl = fh.read()
    conn = connect()
    try:
        conn.executescript(ddl)
        conn.commit()
    finally:
        conn.close()


# --- jobs -------------------------------------------------------------------
def upsert_job(conn: sqlite3.Connection, cfg: Dict[str, Any]) -> None:
    """Insert/replace a job's CONFIG half. Preserves existing state columns."""
    conn.execute(
        """
        INSERT INTO jobs (id, name, description, enabled, runner, config, updated_at)
        VALUES (:id, :name, :description, :enabled, :runner, :config, :updated_at)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            description=excluded.description,
            enabled=excluded.enabled,
            runner=excluded.runner,
            config=excluded.config,
            updated_at=excluded.updated_at
        """,
        {
            "id": cfg["id"],
            "name": cfg.get("name", cfg["id"]),
            "description": cfg.get("description"),
            "enabled": 1 if cfg.get("enabled", False) else 0,
            "runner": cfg.get("runner", "nas-python"),
            "config": json.dumps(cfg),
            "updated_at": _utcnow(),
        },
    )
    conn.commit()


def get_job(conn: sqlite3.Connection, job_id: str) -> Optional[Dict[str, Any]]:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return _job_row_to_dict(row) if row else None


def all_jobs(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = conn.execute("SELECT * FROM jobs ORDER BY name").fetchall()
    return [_job_row_to_dict(r) for r in rows]


def _job_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    try:
        d["config"] = json.loads(d["config"])
    except (ValueError, TypeError):
        d["config"] = {}
    d["enabled"] = bool(d["enabled"])
    return d


# --- runs -------------------------------------------------------------------
def start_run(conn: sqlite3.Connection, job_id: str, trigger_source: str) -> int:
    cur = conn.execute(
        "INSERT INTO runs (job_id, trigger_source, started_at, status) "
        "VALUES (?, ?, ?, 'running')",
        (job_id, trigger_source, _utcnow()),
    )
    conn.commit()
    return int(cur.lastrowid)


def finish_run(conn: sqlite3.Connection, run_id: int, result: Dict[str, Any]) -> None:
    conn.execute(
        """
        UPDATE runs SET finished_at=?, status=?, duration_ms=?, output=?, error=?,
               tokens=?, cost_usd=? WHERE id=?
        """,
        (
            _utcnow(),
            result.get("status", "error"),
            result.get("durationMs"),
            result.get("output"),
            result.get("error"),
            result.get("tokens"),
            result.get("costUsd"),
            run_id,
        ),
    )
    conn.commit()


def recent_runs(conn: sqlite3.Connection, job_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM runs WHERE job_id=? ORDER BY id DESC LIMIT ?", (job_id, limit)
    ).fetchall()
    return [dict(r) for r in rows]


# --- results (inbox) --------------------------------------------------------
def add_result(conn: sqlite3.Connection, job_id: str, title: str, preview: str) -> None:
    conn.execute(
        "INSERT INTO results (job_id, time, title, preview, unread) VALUES (?, ?, ?, ?, 1)",
        (job_id, _utcnow(), title, preview),
    )
    conn.commit()


def recent_results(conn: sqlite3.Connection, job_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM results WHERE job_id=? ORDER BY id DESC LIMIT ?", (job_id, limit)
    ).fetchall()
    return [dict(r) for r in rows]


# --- state ------------------------------------------------------------------
def update_job_state(
    conn: sqlite3.Connection,
    job_id: str,
    last_status: str,
    last_run_at: str,
    last_duration_ms: Optional[int],
    add_unread: int = 0,
) -> None:
    conn.execute(
        """
        UPDATE jobs SET last_status=?, last_run_at=?, last_duration_ms=?,
               unread_count = unread_count + ?, updated_at=?
        WHERE id=?
        """,
        (last_status, last_run_at, last_duration_ms, add_unread, _utcnow(), job_id),
    )
    conn.commit()
