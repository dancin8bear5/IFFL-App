# IFFL App

Native iOS app (SwiftUI) for the **Insanity Fantasy Football League** — a 12-team dynasty/keeper league.

## What this is

One place for every IFFL transaction: trades, FAAB sealed bids, keeper selection, dues, Low Points Parlay, calendar reminders, rule voting, championship belt history. ESPN remains the source of truth for live NFL scoring; this app is the source of truth for everything IFFL-specific (keeper costs, $300 luxury tax, $150 FAAB, $200 auction budgets, $250 dues).

The full implementation plan lives at `~/.claude/plans/i-need-help-planning-robust-fern.md`.

## Project layout

```
ios/                            SwiftUI Xcode project (iOS 17+)
backend/supabase/               Postgres migrations, RLS, Edge Functions, seed
backend/iffl-python-service/    Fly.io service: ESPN sync + Commish Agent HTTP wrapper
docs/                           Architecture, schema, deploy, runbook
```

## Existing systems this integrates with (do not replace)

- **ESPN league 331652** — read via private-league API + cookies
- **Google Sheet** `2026 IFFL Keeper Master List.xlsx` — one-time seed, then write-back mirror during parallel-run window
- **`~/Documents/Claude/Projects/IFFL Commish Agent/`** — Apps Script (Make.com webhook) + Python parser library; both kept running, both wrapped by this app

## Status

Phase 0 — Foundation. See plan file for milestones.
