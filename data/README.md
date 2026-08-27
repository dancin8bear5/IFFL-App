# data/ — source material the league data is built from

## What's here

| file | what it is |
|---|---|
| `iffl_fantasy_history_2008-2025.csv` | **The master source.** Full ESPN league export, 2008–2025: 44,135 rows covering every team season, every game, every rostered player's season and (2018+) weekly lines, and every draft. 4.4 MB. |
| `espn-team-identity-map.json` | Which franchise owned each ESPN team slot in each season. Needed to re-import without Firestore already being populated. |

## Why the CSV is committed

Everything the app shows about league history — the Trophy Room charts, the 23
record cards, the standings' real points-for/against, the backfilled weekly
scores — is *derived* from this one file by `web/scripts/import-history.mjs`.

Firestore holds the derived output. This file is the input. If the derived data
is ever lost, corrupted, or needs recomputing under a different definition, it
is rebuilt from here. That makes this CSV the single most important artifact in
the repo, and it previously existed in exactly one place: a laptop's Downloads
folder.

## Restoring the league history from scratch

```bash
cd web && node scripts/import-history.mjs ../data/iffl_fantasy_history_2008-2025.csv --dry-run
```

Review the output, then re-run without `--dry-run`. It authenticates with
`gcloud auth print-access-token` (the commissioner's own Google login — there
is no service-account key on this machine) and writes:

- `historyTeamSeasons/{year}`, `historyMatchups/{year}`, `historyPlayerSeasons/{year}`,
  `historyPlayerWeeks/{year}-{WW}`, `historyDrafts/{year}`
- `historyAggregates/{scoring,draft,lineups}` — precomputed chart feeds
- `leagueRecords/auto-*` — the computed record cards
- `leagueHistory/{year}` — standings enriched with real points
- `weeklyScores/{year}` — skipped for any season that already has entered weeks

Every doc id is deterministic, so re-running **replaces** rather than
duplicates. It is safe to run repeatedly.

### The one circular dependency, and why the map file exists

The importer figures out which ESPN team slot belongs to which franchise by
joining ESPN's final ranks against the standings already seeded in
`leagueHistory`. In a real restore, `leagueHistory` would be empty — so that
join has nothing to work against.

`espn-team-identity-map.json` is that resolved mapping, frozen. If you ever
restore into an empty Firestore, seed `leagueHistory` first (from
`Services/DataSeeder.swift`'s `historySeeds`, still in the repo) or use this
file to supply the mapping directly.

## What is NOT backed up

Firestore itself has no point-in-time recovery, no scheduled backups, and no
delete protection enabled on this project as of Aug 2026. Google replicates the
data across regions (`nam5`), so hardware failure is not the risk — an
accidental deletion or a bad script run is. This directory is the recovery
plan for the *history* data specifically; league data that has no source file
(trades, rosters, rules, votes, avatars) is not covered by it.
