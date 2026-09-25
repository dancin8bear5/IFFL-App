# Agent 2: Weekly Dashboard Update

**Todoist:** `[2/6] Weekly dashboard update agent` · p2
**Runs:** Cloud Function `pollEspnWeekly` (`iffl-auth`)
**Depends on:** #1, so it deploys and gets health-checked.

## Goal

Once a week, the agent writes the finished week's data into the collections the Dashboard already reads, so the charts, the parlay and the weekly records stop going stale.

## What's broken today

- `weeklyScores/{season}`: **nothing writes it** (CLAUDE.md). The season scoring chart, Low Points Parlay and weekly records all read it.
- Standings are covered by `pollEspnStandings`, which runs hourly (shipped Sep 23), so they're out of scope here.

## Scope

| Writes | Source | Notes |
|---|---|---|
| `weeklyScores/{season}` week N | ESPN v3 `?view=mMatchupScore` | Use the row shape the charts already read. Don't invent a new one. |
| `leagueRecords` (new highs/lows) | derived from the above | Only when a record breaks |
| Playoff picture | `espnStandings` + remaining schedule | Clinched / eliminated flags |

## Build steps

### 1. Confirm the target shapes
- Read `weeklyScores` consumers (`SeasonScoringChart`, `ParlayView`, `leagueStats.js`) and write down the exact row shape.
- **Done when:** the shape is documented in this file and Jared confirms the scope table.

### 2. `parseWeeklyScores(data, week)` in `functions/espnScores.js`
- Pure. Reuse `ESPN_TEAM_ID_TO_NAME`. Unknown ids go into `problems[]` and are never guessed.
- Only final matchups (`winner !== 'UNDECIDED'`). A partial week returns `complete: false`.
- **Done when:** the offline tests cover a full week, a partial week, a bye and an unknown id.

### 3. Scheduled function
- `onSchedule("every tuesday 10:00", America/Chicago)`, which runs after Monday night football and stat corrections.
- Idempotent: it overwrites week N only and leaves other weeks alone.
- Writes `config/weeklyPoller { lastRunAt, lastError, week, problems }`.
- A `forceWeek` field on that doc lets the commissioner backfill a week.
- **Done when:** a backfill of weeks 1–3 (2026) matches ESPN's box scores.

### 4. Guardrails + notify
- Admin → Areas `weekly` kill switch.
- GroupMe DM to Jared: `Week N written · 6 games · 0 problems`, or the problem list.
- Add `config/weeklyPoller` to agent #1's critical-process check (it must be fresh by Tue 11:00 CT during the season).
- **Done when:** the switch off means no write, and the DM arrives.

## Open decisions
- [ ] Is the playoff picture in or out of v1?
- [ ] Do record-break announcements feed agent #3 as note drafts? (Recommended: yes.)
