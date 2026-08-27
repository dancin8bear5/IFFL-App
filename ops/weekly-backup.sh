#!/bin/bash
# weekly-backup.sh — snapshot the league's irreplaceable Firestore data.
# Scheduled by ops/com.iffl.weekly-backup.plist (Sundays 09:00).
# Writes to the NAS: /Volumes/homes/jaredrogtaylor/Backups/IFFL
# See web/scripts/backup-firestore.mjs.
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/apps/iffl-web-app"
LOG="$PROJECT_DIR/out/weekly-backup.log"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH; node lives under nvm here.
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"

cd "$PROJECT_DIR/web" || { echo "cannot cd to $PROJECT_DIR/web" >> "$LOG"; exit 1; }

if node scripts/backup-firestore.mjs >> "$LOG" 2>&1; then
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') OK ===" >> "$LOG"
else
  # Two likely causes: the NAS share isn't mounted (exit 2 — reconnect
  # smb://192.168.1.124 in Finder), or the gcloud token expired (`gcloud auth
  # login`). Logged rather than silent, because a backup everyone assumes is
  # running is worse than one known to be broken.
  code=$?
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (exit $code) ===" >> "$LOG"
  [ "$code" = "2" ] && echo "    NAS not mounted — reconnect smb://192.168.1.124 in Finder" >> "$LOG"
  exit 1
fi

# Keep the log from growing forever.
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
