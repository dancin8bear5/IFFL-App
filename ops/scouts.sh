#!/bin/bash
# scouts.sh — weekly: three scouts each propose one improvement to the app,
# a builder writes it, a second model reviews it, and what survives becomes
# a pull request labelled `scout`. Nothing merges or deploys from here.
# Scheduled by ops/com.iffl.scouts.plist (Wednesdays 10:00). The job itself
# is a graph: ops/graph/scouts.mjs.
#
#   bash ops/scouts.sh                    the weekly run
#   bash ops/scouts.sh --only data        one scout
#   bash ops/scouts.sh --no-pr            build but don't open pull requests
#   node ops/graph/scouts.mjs --plan      print the steps, run nothing
#
# To pause the scouts:  launchctl unload ~/Library/LaunchAgents/com.iffl.scouts.plist
set -uo pipefail

PROJECT_DIR="$HOME/claude-agents/iffl-web-app"
LOG="$PROJECT_DIR/out/scouts.log"
mkdir -p "$(dirname "$LOG")"

# launchd runs with a minimal PATH: node is under nvm, gh under Homebrew,
# claude under ~/.local/bin.
export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting ===" >> "$LOG"
cd "$PROJECT_DIR" || { echo "cannot cd to $PROJECT_DIR" >> "$LOG"; exit 1; }

node ops/graph/scouts.mjs "$@" >> "$LOG" 2>&1
code=$?

echo "=== $(date '+%Y-%m-%d %H:%M:%S') $([ "$code" = 0 ] && echo OK || echo "FAILED (exit $code)") ===" >> "$LOG"
tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit "$code"
