#!/bin/bash
# espn-weekly.sh — the ONE weekly ESPN job. Tuesday pull of last week's IFFL player
# lines and matchups from ESPN into data/iffl_fantasy_history_2008-2025.csv and
# Firestore (historyPlayerWeeks/Seasons, historyMatchups, historyTeamSeasons,
# weeklyScores, config/weeklyPoller), then the finished-trades export to
# data/trades-2025-on.csv. Both data files are committed and pushed.
# Scheduled by ops/com.iffl.espn-weekly.plist (Tuesdays 08:00).
# See web/scripts/scrape-espn-week.mjs. Run by hand: bash ops/espn-weekly.sh [--week N]
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/iffl-web-app"
LOG="$PROJECT_DIR/out/espn-weekly.log"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH; node lives under nvm here (same as weekly-backup.sh).
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"IFFL ESPN scrape\"" >/dev/null 2>&1 || true; }

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"
cd "$PROJECT_DIR/web" || { echo "cannot cd to $PROJECT_DIR/web" >> "$LOG"; notify "FAILED: repo missing"; exit 1; }

# Two tries 10 minutes apart: ESPN pages occasionally stall. Every write is
# replace-by-week, so a second attempt can never duplicate rows.
for attempt in 1 2; do
  if node scripts/scrape-espn-week.mjs "$@" >> "$LOG" 2>&1; then
    # Finished trades → data/trades-2025-on.csv (web/scripts/export-trades.mjs). The
    # scores are already safe by this point, so a failure here is logged and
    # notified but never fails the run or triggers the retry.
    node scripts/export-trades.mjs --write >> "$LOG" 2>&1 \
      || { echo "WARN: trades export failed (scores are unaffected)" >> "$LOG"; notify "Trades export failed — see log"; }
    # Commit the data files so they never pile up as pending changes. Only these
    # two files, only the ones that changed; a push failure is logged but never
    # fails the run.
    FILES=(data/iffl_fantasy_history_2008-2025.csv data/trades-2025-on.csv)
    CHANGED=()
    for f in "${FILES[@]}"; do
      [ -f "$PROJECT_DIR/$f" ] || continue
      # tracked-and-modified, or brand new (the trades file on its first run)
      if ! git -C "$PROJECT_DIR" diff --quiet -- "$f" || [ -n "$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard -- "$f")" ]; then CHANGED+=("$f"); fi
    done
    if [ "$(git -C "$PROJECT_DIR" branch --show-current)" = main ] && [ "${#CHANGED[@]}" -gt 0 ]; then
      { git -C "$PROJECT_DIR" add -- "${CHANGED[@]}" \
          && git -C "$PROJECT_DIR" commit -q -m "data: 2026 ESPN weekly scrape $(date +%F)" -- "${CHANGED[@]}" \
          && git -C "$PROJECT_DIR" pull -q --rebase --autostash origin main \
          && git -C "$PROJECT_DIR" push -q origin HEAD:main \
          && echo "data committed + pushed: ${CHANGED[*]}" ; } >> "$LOG" 2>&1 \
        || { echo "WARN: data commit/push failed (data is safe in Firestore)" >> "$LOG"; notify "Data push failed — see log"; }
    fi
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
