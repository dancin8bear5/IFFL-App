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

## Firestore's own protections (as of Aug 26, 2026)

- **Delete protection: ENABLED.** The database can't be deleted without turning
  that flag off first. This is free.
- **Point-in-time recovery: DISABLED.** Deliberate — it's a paid feature and
  was declined. There is therefore no rollback for a bad write or a mistaken
  bulk delete; the weekly snapshot below is the only undo, and it's weekly, not
  continuous.
- **Google-managed backup schedules: none.** Also paid.

Google replicates the data across regions (`nam5`), so hardware failure was
never the risk. Deleting something by accident is.

---

## Weekly backups (added Aug 26, 2026)

`ops/weekly-backup.sh`, scheduled by `ops/com.iffl.weekly-backup.plist`
(installed to `~/Library/LaunchAgents`, **Sundays 09:00**), runs
`web/scripts/backup-firestore.mjs` and writes a gzipped snapshot to:

- `data/backup/` — **gitignored**, see below
- `~/Library/Mobile Documents/com~apple~CloudDocs/IFFL-Backups/` — iCloud Drive,
  which is what makes the backup survive this laptop

Twelve snapshots are kept in each location (~3 months); older ones are pruned.
Roughly 1,078 documents compress to ~119 KiB, so a year costs a few MB.

**These snapshots are never committed.** The GitHub repo is public, and
`config/league` contains all 12 members' email addresses (`teamEmailMap`) plus
their Firebase UIDs. `.gitignore` excludes `data/backup/`; keep it that way.

The snapshot skips the six derived `history*` collections — ~45 of the
database's ~47 MiB — because they are rebuilt from the CSV in this directory.
What it captures is the ~1 MiB that exists nowhere else: rosters, trades, the
transaction ledger, rules and votes, avatars, keeper plans, the big board, and
`config/league`. The script **aborts rather than write a snapshot missing
`config/league.userTeamMap`** — losing that map doesn't just lose data, it
locks every member out of their own team.

Check on it: `tail ~/claude-agents/apps/iffl-web-app/out/weekly-backup.log`
Run it now: `bash ~/claude-agents/apps/iffl-web-app/ops/weekly-backup.sh`

The most likely failure is an expired gcloud token (`gcloud auth login` fixes
it). The script logs failures explicitly instead of exiting quietly, because a
backup everyone assumes is running is worse than one known to be broken.

### Restoring from a snapshot

The file is gzipped JSON with Firestore's REST value encoding preserved
(`{"stringValue": …}`), so documents can be written straight back through the
same REST API `import-history.mjs` uses:

```bash
python3 -c "import gzip,json;d=json.loads(gzip.open('data/backup/<file>.json.gz').read());print(list(d['collections']))"
```
