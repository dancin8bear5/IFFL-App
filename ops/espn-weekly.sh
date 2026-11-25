#!/bin/bash
# espn-weekly.sh — the ONE weekly ESPN job.
#
# WHEN it runs is decided here, not by launchd (Nov 25, 2026). launchd only
# calls this every few minutes with --scheduled; ops/graph/due.mjs then says
# whether a week is owed — due at Monday 11:59pm CENTRAL, whatever time zone
# the Mac is in, and still owed after any shutdown or sleep until it is done.
# (launchd's own calendar skipped week 11: the Mac was powered off at the
# slot, and launchd never makes that up.)
#
# The job itself is a graph — ops/graph/tuesday.mjs (the name is from when it
# ran on Tuesdays) — which checks the gcloud login, scrapes the week from
# ESPN into Firestore + the history CSV, exports finished trades, commits the
# data files, confirms the League Feed published, and sends ONE summary
# notification. It retries by kind of failure and RESUMES from out/runs/.
#
#   bash ops/espn-weekly.sh --scheduled   what launchd runs: only if a week is owed
#   bash ops/espn-weekly.sh               run now (the scraper picks the week)
#   bash ops/espn-weekly.sh --week 9      redo a week
#   node ops/graph/due.mjs                what is owed right now (prints nothing if nothing)
#   node ops/graph/tuesday.mjs --plan     print the steps, run nothing
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/iffl-web-app"
LOG="$PROJECT_DIR/out/espn-weekly.log"
LOCK="$PROJECT_DIR/out/espn-weekly.lock"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH; node lives under nvm here (same as weekly-backup.sh).
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$PROJECT_DIR" || { echo "cannot cd to $PROJECT_DIR" >> "$LOG"; exit 1; }

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"IFFL score job\"" >/dev/null 2>&1 || true; }

SCHEDULED=0
if [ "${1:-}" = "--scheduled" ]; then SCHEDULED=1; shift; fi

# No node = no way to even ask what is owed. Say so, but once a day, not
# every five minutes.
if ! command -v node >/dev/null 2>&1; then
  MARK="$PROJECT_DIR/out/espn-weekly.no-node.$(date +%Y%m%d)"
  if [ ! -e "$MARK" ]; then
    : > "$MARK"
    echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (node not found on PATH) ===" >> "$LOG"
    notify "Could not start: node not found — see out/espn-weekly.log"
  fi
  exit 1
fi

# One run at a time. A run can sit in a 30-minute wait while the next
# check comes round; that check must not start a second scrape.
if ! mkdir "$LOCK" 2>/dev/null; then
  OTHER="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then
    [ "$SCHEDULED" = 1 ] || echo "another run is in progress (pid $OTHER)"
    exit 0
  fi
  rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || exit 0   # a dead run's lock
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

if [ "$SCHEDULED" = 1 ]; then
  OWED="$(node ops/graph/due.mjs 2>>"$LOG")"
  [ -n "$OWED" ] || exit 0          # nothing owed: no log line, no noise
  # shellcheck disable=SC2086
  set -- $OWED "$@"
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"
START_LINE=$(( $(wc -l < "$LOG") ))   # arithmetic strips wc's padding; tail rejects it

node ops/graph/tuesday.mjs "$@" >> "$LOG" 2>&1
code=$?

if [ "$code" = 0 ]; then
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') OK ===" >> "$LOG"
  # Remember the newest week this run brought in, so it is not owed again.
  WEEK="$(tail -n +"$START_LINE" "$LOG" | sed -nE 's/.*season [0-9]{4} week\(s\) ([0-9,]+).*/\1/p' | tail -1 | tr ',' '\n' | sort -n | tail -1)"
  case " $* " in *" --dry-run "*|*" --plan "*) WEEK="" ;; esac
  [ -n "$WEEK" ] && node ops/graph/due.mjs --record ok "$WEEK" 2>>"$LOG"
else
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') FAILED (exit $code) ===" >> "$LOG"
  [ "$SCHEDULED" = 1 ] && node ops/graph/due.mjs --record fail 2>>"$LOG"
  # The graph notifies on its own failures. This covers the one case it
  # can't: the graph file failing to load.
  if ! tail -n 5 "$LOG" | grep -q "FAILED —"; then
    notify "Could not start — see out/espn-weekly.log"
  fi
fi
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit "$code"
