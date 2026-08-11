# DSM setup — Synology DS216play

DSM owns the schedule. Each job = one **Task Scheduler** entry that fires
`tick.py <job-id>`. A separate boot task keeps the read-only dashboard running.

## 0. Prerequisites (one time)
1. **Control Panel → Terminal & SNMP → Enable SSH** (so you can test from a shell).
2. **Package Center → install Python 3** (Synology package). Confirm the path:
   ```sh
   which python3        # e.g. /usr/local/bin/python3  or  /volume1/@appstore/py3/usr/bin/python3
   python3 --version    # note the version — the runner targets 3.8+
   ```
3. Copy this project onto the NAS, e.g. to `/volume1/agent-control-center`
   (File Station, or `git clone`). Then:
   ```sh
   cd /volume1/agent-control-center/runner
   cp .env.example .env          # edit: set ANTHROPIC_API_KEY, ACC_MODEL
   python3 seed.py               # load jobs/*.json into SQLite
   python3 tick.py daily-note --source manual --dry-run   # prove the pipeline
   python3 tick.py daily-note --source manual             # real API call
   ```
   `pip install -r requirements.txt` is optional (only for the .env auto-loader);
   otherwise set env vars in each Task Scheduler entry instead.

## 1. Scheduled job — Daily Note (the first brick)
**Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script.**
- **General:** name `ACC daily-note`; user `your-admin-user`.
- **Schedule:** daily at 06:00 (set the NAS timezone to America/Denver under
  Control Panel → Regional Options so cron-in-config matches reality).
- **Task Settings → Run command:**
  ```sh
  cd /volume1/agent-control-center/runner && ANTHROPIC_API_KEY=sk-... ACC_MODEL=claude-opus-4-8 python3 tick.py daily-note
  ```
  (Or rely on `.env` if you installed python-dotenv, and drop the inline vars.)

Add one entry per enabled job, changing only the `<job-id>` at the end.

## 2. Dashboard — keep it running
Create a **Triggered Task → Boot** (User-defined script) that starts the server:
```sh
cd /volume1/agent-control-center/runner && python3 server.py >> logs/server.log 2>&1 &
```
Create the log dir once: `mkdir -p /volume1/agent-control-center/runner/logs`.
Then browse to `http://<nas-ip>:8787/`.

- **On your home network:** that URL just works on your iPhone.
- **Remote (off-network):** enable **Synology QuickConnect** (Control Panel →
  External Access) or a reverse proxy in DSM, and reach the dashboard through
  that. No cloud store needed — SQLite stays on the NAS.

## 3. Verify
```sh
sqlite3 /volume1/agent-control-center/store/acc.sqlite \
  "select id,last_status,unread_count from jobs; select id,status,duration_ms from runs order by id desc limit 5;"
```
The dashboard's status stripe, `last` status, and the "N new" badge should match.

## Notes
- The DS216play is too weak to run Claude Code itself — `nas-python` only makes
  a plain HTTPS call to the Anthropic API. Heavy/connector agents go on the
  `cloud` runner later.
- To add an agent: drop a `jobs/<id>.json`, run `python3 seed.py`, add its Task
  Scheduler entry.
