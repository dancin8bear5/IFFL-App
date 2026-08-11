# Agent Control Center

Self-hosted scheduler + dashboard to move scheduled agents **off Claude Cowork
cloud routines** onto your own infra, with a UI to configure, run, and monitor
them.

- **Control plane:** Synology **DS216play NAS** (always-on; no Docker).
- **Scheduler:** DSM **Task Scheduler** fires `tick.py <job-id>` per job.
- **Store:** **SQLite** on the NAS (`store/acc.sqlite`).
- **Execution:** swappable **`runner`** per job — `nas-python` (light, Anthropic
  API direct), `cloud` (heavy Claude Code, later), `mac` (future `macmini`).
- **Dashboard:** read-only, stdlib `http.server`, served on the NAS.

Nothing here needs pip on the NAS — the runner is **stdlib-only** (`sqlite3`,
`urllib`, `http.server`).

## Status — MVP (first brick built)
- ✅ SQLite store + schema (`jobs`, `runs`, `results`)
- ✅ `runner` seam + `nas-python` adapter (with dry-run)
- ✅ `tick.py` (run one job) + `seed.py` (load configs)
- ✅ Read-only dashboard (`server.py` + `web/control-center.html`)
- ✅ First brick job `daily-note` (connector-free, proves the pipeline)
- ⏳ `morning-briefing` present but **disabled** — needs connectors (see below)
- ⏳ `cloud` / `mac` runners are stubs; DSM entries are documented, not created

## Layout
```
jobs/                 per-agent config JSON (config half of the schema)
  daily-note.json     connector-free first brick (enabled)
  morning-briefing.json  agent #2 (disabled until connectors solved)
store/schema.sql      SQLite DDL (jobs, runs, results)
runner/
  config.py           env config (stdlib; optional .env)
  store.py            SQLite access layer
  runners/            the runner seam: nas_python.py, cloud.py(stub), mac.py(stub)
  tick.py             execute ONE job by id  (DSM calls this)
  seed.py             load jobs/*.json into SQLite
  server.py           read-only dashboard API + static serve
web/control-center.html   dashboard UI (fetches /api/*)
docs/DSM-setup.md     step-by-step Synology setup
```

## Quick start (works on your Mac too, for testing)
```sh
cd agent-control-center/runner
python3 seed.py                              # load job configs into SQLite
python3 tick.py daily-note --dry-run         # prove the pipeline, no API key
# real run (uses ANTHROPIC_API_KEY from env or .env):
ANTHROPIC_API_KEY=sk-... python3 tick.py daily-note --source manual
python3 server.py                            # dashboard at http://localhost:8787
```
Deploy on the NAS: **see `docs/DSM-setup.md`**.

## Job schema (config + state)
Config lives in `jobs/<id>.json`; the system writes state back into SQLite
(read-only in the UI): `last_status`, `last_run_at`, `next_run_at`,
`unread_count`, `last_duration_ms`. `secrets` holds **names**, not values.

Two deliberate seams:
- **`runner` is top-level** → moving a job to the Mac mini in 2027 is a one-line
  change, no rewrite.
- **`secrets` are references** → configs are safe to version and back up.

## Why `daily-note` is first (and Morning Briefing isn't)
`nas-python` makes a plain Anthropic API call and has **no Cowork connectors**.
`daily-note` needs none, so it proves the whole pipeline end-to-end. Morning
Briefing needs Gmail/Calendar/Todoist, so it's parked (`enabled:false`,
`runner:"cloud"`) until connectors are wired or its `cloud` runner is built.

## Not in the MVP (deliberate)
- Run-now / editing from the dashboard (read-only for now).
- `cloud` runner + host choice (Fly.io / Cloud Run / VPS).
- Session-based re-auth for the Fidelity statement watchdog (the genuinely hard
  one — designed later).
