#!/bin/bash
# espn-weekly.sh — Tuesday pull of last week's IFFL player lines from ESPN into
# data/iffl_fantasy_history_2008-2025.csv + Firestore historyPlayerWeeks.
# Scheduled by ops/com.iffl.espn-weekly.plist (Tuesdays 08:00).
# See web/scripts/scrape-espn-week.mjs. Run by hand: bash ops/espn-weekly.sh [--week N]
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/iffl-web-app"
LOG="$PROJECT_DIR/out/espn-weekly.log"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH; node lives under nvm here (same as weekly-backup.sh).
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"IFFL ESPN scrape\"" >/dev/null 2>&1 || true; }

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"
cd "$PROJECT_DIR/web" || { echo "cannot cd to $PROJECT_DIR/web" >> "$LOG"; notify "FAILED: repo missing"; exit 1; }

# Two tries 10 minutes apart: ESPN pages occasionally stall. Every write is
# replace-by-week, so a second attempt can never duplicate rows.
for attempt in 1 2; do
  if node scripts/scrape-espn-week.mjs "$@" >> "$LOG" 2>&1; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') OK ===" >> "$LOG"
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
    exit 0
  fi
  # Logged-out and not-final failures won't fix themselves in 10 minutes.
  if tail -n 20 "$LOG" | grep -qE "logged out|not final|refusing week"; then break; fi
  [ "$attempt" = 1 ] && sleep 600
done

reason=$(grep -E "ERROR|FAIL" "$LOG" | tail -1 | cut -c21-120 | tr '"' "'")
echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED ===" >> "$LOG"
# Most likely causes: ESPN session expired (run the --login step again) or the
# gcloud token expired (`gcloud auth login`).
notify "FAILED: ${reason:-see out/espn-weekly.log}"
exit 1
