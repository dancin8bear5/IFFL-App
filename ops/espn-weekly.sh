#!/bin/bash
# espn-weekly.sh — the ONE weekly ESPN job. Scheduled by
# ops/com.iffl.espn-weekly.plist (Monday nights 11:30pm; Tuesday 08:00 until
# Nov 25, 2026 — the graph is still called "tuesday").
#
# This file is only the launchd wrapper now: PATH, log, and a last-ditch
# notification. The job itself is a graph — ops/graph/tuesday.mjs — which
# checks the gcloud login, scrapes last week from ESPN into Firestore + the
# history CSV, exports finished trades, commits the data files, confirms the
# League Feed published, and sends ONE summary notification. It retries by
# kind of failure and RESUMES from out/runs/ if re-run after one.
#
#   bash ops/espn-weekly.sh              normal run
#   bash ops/espn-weekly.sh --week 9     redo a week
#   node ops/graph/tuesday.mjs --plan    print the steps, run nothing
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/iffl-web-app"
LOG="$PROJECT_DIR/out/espn-weekly.log"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH; node lives under nvm here (same as weekly-backup.sh).
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"
cd "$PROJECT_DIR" || { echo "cannot cd to $PROJECT_DIR" >> "$LOG"; exit 1; }

node ops/graph/tuesday.mjs "$@" >> "$LOG" 2>&1
code=$?

if [ "$code" = 0 ]; then
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') OK ===" >> "$LOG"
else
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (exit $code) ===" >> "$LOG"
  # The graph notifies on its own failures. This covers the one case it
  # can't: node itself missing or the graph file failing to load.
  if ! tail -n 5 "$LOG" | grep -q "FAILED —"; then
    /usr/bin/osascript -e 'display notification "Could not start — see out/espn-weekly.log" with title "IFFL Tuesday job"' >/dev/null 2>&1 || true
  fi
fi
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit "$code"
