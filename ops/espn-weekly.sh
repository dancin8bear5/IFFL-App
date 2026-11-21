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

# Pre-flight: the gcloud login is what every Firestore write rides on, and it
# expires. Checking it first turns "scraped twelve pages, then failed at the
# write" into a five-second failure that names its own fix.
if ! gcloud auth print-access-token >/dev/null 2>>"$LOG"; then
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (pre-flight: gcloud login expired) ===" >> "$LOG"
  notify "FAILED: gcloud login expired — run: gcloud auth login"
  exit 1
fi

# The loop. Three kinds of failure, three different answers:
#   stall        → try again in 10 minutes (ESPN pages occasionally hang)
#   not final    → wait 3 hours and look again, up to MAX_WAITS times — a
#                  Monday game that ran late fixes itself, just not in 10 min
#   logged out   → stop and say so; only a person can sign in
# Every write is replace-by-week, so no retry can duplicate rows.
MAX_WAITS=3
waits=0
attempt=1
while :; do
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
  recent=$(tail -n 20 "$LOG")
  if echo "$recent" | grep -q "logged out"; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (ESPN session expired) ===" >> "$LOG"
    notify "ESPN sign-in expired — run: cd ~/claude-agents/iffl-web-app/web && node scripts/scrape-espn-week.mjs --login"
    exit 1
  fi
  if echo "$recent" | grep -qE "not final|refusing week"; then
    [ "$waits" -ge "$MAX_WAITS" ] && break
    waits=$((waits + 1))
    echo "--- $(date '+%Y-%m-%d %H:%M:%S') week not final yet; waiting 3h (wait $waits of $MAX_WAITS) ---" >> "$LOG"
    [ "$waits" = 1 ] && notify "Week not final yet — will retry every 3h, up to $MAX_WAITS times"
    sleep 10800
    continue
  fi
  [ "$attempt" -ge 2 ] && break
  attempt=$((attempt + 1))
  sleep 600
done

reason=$(grep -E "ERROR|FAIL" "$LOG" | tail -1 | cut -c21-120 | tr '"' "'")
echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED ===" >> "$LOG"
# Most likely causes: ESPN session expired (run the --login step again) or the
# gcloud token expired (`gcloud auth login`).
notify "FAILED: ${reason:-see out/espn-weekly.log}"
exit 1
