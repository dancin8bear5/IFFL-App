# IFFL Agent Backlog

Build specs for the seven agents in Todoist → Fantasy (`IFFL` label). Build them **in order**: each one assumes the ones above it exist.

| # | Agent | Runs where | Visible to | Spec |
|---|-------|-----------|-----------|------|
| 1 | Deploy + verify | GitHub Actions | Jared | [01-deploy-agent.md](01-deploy-agent.md) |
| 2 | Weekly dashboard update | Cloud Functions (`iffl-auth`) | League | [02-weekly-dashboard-agent.md](02-weekly-dashboard-agent.md) |
| 3 | League notes (human-approved) | Cloud Functions + Admin UI | League, after approval | [03-league-notes-agent.md](03-league-notes-agent.md) |
| 4 | Waiver targets | Analytics Engine (Rudy / ACC) | Jared only | [04-waiver-agent.md](04-waiver-agent.md) |
| 5 | Start/sit | Analytics Engine (Rudy / ACC) | Jared only | [05-start-sit-agent.md](05-start-sit-agent.md) |
| 6 | Design + usability review | GitHub Actions + Claude API | Jared (Todoist tickets) | [06-design-review-agent.md](06-design-review-agent.md) |
| 7 | Reels (watch + request, human-approved) | Web app + Cloud Functions + Mac renderer | League, after approval | [07-reels-agent.md](07-reels-agent.md) |

## Status — Nov 21, 2026

- **#1 Deploy + verify** — built. Runs on demand only (`gh workflow run deploy.yml --ref main`); merging to `main` just runs tests. The auto-merge, Claude fixer and Telegram report were retired.
- **#2 Weekly scores** — built, but not as first specced: the Mac's Tuesday scrape (`ops/espn-weekly.sh`) is the one writer. The Cloud Function pollers are retired.
- **#3 League notes** — built for the weekly recap only. Trade, record, deadline and phase notes are not built.
- **League Feed** — built Nov 21, 2026 (`functions/leagueFeed.js`). Game recaps, the week-in-review and trade write-ups publish to the website with no approval; a write → fact-check → rewrite loop with a template fallback stands in for it. Record alerts (`functions/recordWatch.js`) and calendar notices post the same way.
- **#4 Waiver targets, #5 Start/sit** — built. They run from launchd on the Mac out of `iffl-analytics-agent` and report to Telegram.
- **#8 Scouts + builder** — built Nov 21, 2026 ([08-scouts.md](08-scouts.md)). Three weekly scouts propose one change each, a builder writes it, a second model reviews it, and it arrives as a pull request. This covers most of what #6 was for.
- **#6 Design review, #7 Reels** — specs only.

Next: the roadmap agreed Nov 21, 2026 — a self-posting League Feed (recaps, trades, records, milestones), retry-and-watch loops, the Tuesday job as a flowchart, then scouts and a builder that propose and build new features.

Secrets the built agents need: `FIREBASE_SA`, `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` in GitHub; `ANTHROPIC_API_KEY` in Firebase Secret Manager for #3.

## Rules every agent follows

- **Fail closed.** If an agent can't verify something, it stops and reports. It never guesses. This is the same no-guess rule as the ESPN parsers.
- **Pure core, thin shell.** Parsing and scoring are pure functions with offline tests, and I/O lives in the wrapper. This matches `espnScores.js`.
- **Health doc.** Every scheduled job writes `lastRunAt` / `lastError`, and agent #1 checks those docs after each deploy.
- **Kill switch.** Anything league-visible sits behind an Admin → Areas switch.
- **Privacy line.** Agents 4 and 5 never write to `iffl-auth`, because the other 11 members can read it.
- **Secrets.** Secrets live only in `~/claude-agents/_shared/estate/secrets.env` (Mac / Rudy), Firebase Secret Manager (functions) or GitHub secrets (CI).

## How to start one

Tell Claude: **"Build agent #N from docs/agents/0N-*.md, step 1."** Each step lists its own done-when criteria. Close the matching Todoist subtask when a step passes.
