-- Agent Control Center — SQLite schema (runs on the Synology NAS).
-- Applied automatically by runner/store.py:init_db(). Safe to re-run.
--
-- Design: job config vs system-written state are split. `jobs.config` holds the
-- full config JSON (identity/schedule/runner/task/secrets/output); the state
-- columns (last_run_at, last_status, next_run_at, unread_count, last_duration_ms)
-- are written by the system and read-only in the UI.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
    id                TEXT PRIMARY KEY,              -- stable slug (never changes)
    name              TEXT NOT NULL,
    description       TEXT,
    enabled           INTEGER NOT NULL DEFAULT 1,    -- 0/1
    runner            TEXT NOT NULL,                 -- nas-python | cloud | mac (future: macmini)
    config            TEXT NOT NULL,                 -- full config JSON
    -- system-written state --
    last_run_at       TEXT,
    last_status       TEXT,                          -- success | error | running | skipped
    next_run_at       TEXT,
    unread_count      INTEGER NOT NULL DEFAULT 0,
    last_duration_ms  INTEGER,
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    trigger_source  TEXT NOT NULL DEFAULT 'schedule',  -- schedule | manual
    started_at      TEXT,
    finished_at     TEXT,
    status          TEXT NOT NULL,                     -- success | error | running | skipped
    duration_ms     INTEGER,
    output          TEXT,
    error           TEXT,
    tokens          INTEGER,
    cost_usd        REAL
);
CREATE INDEX IF NOT EXISTS runs_job_idx ON runs(job_id, id DESC);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status);

-- Inbox items -> the "N new" badge on each agent card.
CREATE TABLE IF NOT EXISTS results (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id    TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    time      TEXT NOT NULL,
    title     TEXT,
    preview   TEXT,
    unread    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS results_job_idx ON results(job_id, id DESC);
