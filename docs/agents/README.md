# IFFL Agent Backlog

Build specs for the six agents in Todoist → Fantasy (`IFFL` label). Build them **in order**: each one assumes the ones above it exist.

| # | Agent | Runs where | Visible to | Spec |
|---|-------|-----------|-----------|------|
| 1 | Deploy + verify | GitHub Actions | Jared | [01-deploy-agent.md](01-deploy-agent.md) |
| 2 | Weekly dashboard update | Cloud Functions (`iffl-auth`) | League | [02-weekly-dashboard-agent.md](02-weekly-dashboard-agent.md) |
| 3 | League notes (human-approved) | Cloud Functions + Admin UI | League, after approval | [03-league-notes-agent.md](03-league-notes-agent.md) |
| 4 | Waiver targets | Analytics Engine (Rudy / ACC) | Jared only | [04-waiver-agent.md](04-waiver-agent.md) |
| 5 | Start/sit | Analytics Engine (Rudy / ACC) | Jared only | [05-start-sit-agent.md](05-start-sit-agent.md) |
| 6 | Design + usability review | GitHub Actions + Claude API | Jared (Todoist tickets) | [06-design-review-agent.md](06-design-review-agent.md) |

## Rules every agent follows

- **Fail closed.** If an agent can't verify something, it stops and reports. It never guesses. This is the same no-guess rule as the ESPN parsers.
- **Pure core, thin shell.** Parsing and scoring are pure functions with offline tests, and I/O lives in the wrapper. This matches `espnScores.js`.
- **Health doc.** Every scheduled job writes `lastRunAt` / `lastError`, and agent #1 checks those docs after each deploy.
- **Kill switch.** Anything league-visible sits behind an Admin → Areas switch.
- **Privacy line.** Agents 4 and 5 never write to `iffl-auth`, because the other 11 members can read it.
- **Secrets.** Secrets live only in `~/claude-agents/_shared/estate/secrets.env` (Mac / Rudy), Firebase Secret Manager (functions) or GitHub secrets (CI).

## How to start one

Tell Claude: **"Build agent #N from docs/agents/0N-*.md, step 1."** Each step lists its own done-when criteria. Close the matching Todoist subtask when a step passes.
