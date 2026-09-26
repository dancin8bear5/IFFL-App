# Reading the IFFL historical data

An orientation for an agent who has not seen this repository before. Read
this once before touching anything in `data/`; it will save you from three
or four traps that look like bugs in your code and are actually facts about
the league.

Everything below is repo-relative. The repo is `dancin8bear5/IFFL-App`,
working branch `claude/insanity-league-ios-app-g73Jo`.

---

## 1. There is one source of truth

```
data/iffl_fantasy_history_2008-2025.csv     4.2 MB, 44,136 rows
```

This is a complete ESPN export of the league, 2008–2025. **Every other
historical file in this repo derives from it and can be regenerated.** If a
derived file disagrees with this CSV, the CSV is right.

Two facts that make parsing easy, both verified: the file contains **zero
quote characters**, and **every row has exactly 40 columns**. A naive
`line.split(',')` is safe here. Don't reach for a CSV library.

---

## 2. It is one wide table holding six different row types

This is the thing to understand before anything else. All 44,136 rows share
one 40-column header, and **column 1 (`RecordType`) tells you which columns
on that row mean anything**. The rest are empty strings.

Filter by `RecordType` first. Always.

| `RecordType` | Rows | Seasons | What it is |
|---|---|---|---|
| `TeamSeason` | 214 | 2008–2025 | One row per team per season — final record and rank |
| `TeamWeek` | 3,480 | 2008–2025 | One row per team per game, including playoffs |
| `PlayerSeason` | 4,243 | 2008–2025 | Season totals for every rostered player |
| `PlayerWeek` | 32,002 | **2018–2025** | Weekly player lines — see the gap in §6 |
| `DraftPick` | 4,066 | 2008–2025 | The annual auction, 228 rows/season (19 × 12) |
| `KeeperRoundPick` | 131 | 2020–2025 | Keeper round bookkeeping |

### Which columns are populated, by type

```
TeamSeason       Season TeamId TeamName Wins Losses Ties PointsFor
                 PointsAgainst FinalRank PlayoffSeed

TeamWeek         Season Week TeamId TeamName OpponentTeamId OpponentName
                 TeamScore OpponentScore Margin Winner TeamBenchPoints

PlayerSeason     Season TeamId TeamName PlayerId Player Position ProTeam
                 SeasonTotalPoints SeasonAvgPoints GamesPlayed
                 PositionalRank HighWeeklyScore LowWeeklyScore
                 WeeksOnRosterTracked FinalLineupSlot

PlayerWeek       Season Week TeamId PlayerId Player Position ProTeam
                 LineupSlot Status WeeklyPoints          ← note: no TeamName

DraftPick        Season TeamId TeamName PlayerId Player Position ProTeam
                 Round OverallPick RoundPick AuctionPrice Keeper

KeeperRoundPick  Season TeamId TeamName PlayerId Player Position ProTeam
                 AuctionPrice Keeper InferredDraftRound
```

`PlayerWeek` carries **no `TeamName`** — the highest-volume row type is the
one you cannot read a team name off. Join on `TeamId` (see §3).

---

## 3. Team identity is the trap that will get you

**`TeamName` is what a manager called their team that season, and they
rename constantly.** "bill pony club", "B2B Champ" and "team hogan" are
people, not franchises, and the same person appears under a different name
almost every year. Grouping by `TeamName` produces garbage.

**`TeamId` is the stable franchise slot.** Use it.

To get from a slot to a person, use:

```
data/espn-team-identity-map.json
```

Shape: `{ seasons: { "2019": { "1": "Faybik", "2": "Jason", … } } }` —
season → ESPN `TeamId` → the league's master owner name ("Jared",
"M. Zurek", and departed members like "Eric", "Vince", "Lukas").

Those master names are the join key to everything in the app;
`web/src/data/staticData.js` holds the current twelve with their ESPN
names, abbreviations and owners.

One caveat carried in the map's own comment: **2008 owners were inherited
from each slot's 2009 owner**, anchored on the one known fact (slot 5 =
M. Zurek, the 2008 champion). Treat 2008 attribution as good but not
sourced.

---

## 4. Derived files

All regenerable. Do not hand-edit any of them.

```
data/rookie-draft-history-2017-2025.csv   206 rookie picks, flat, one row each
data/ROOKIE-DRAFT-HISTORY.md              how they were recovered, standalone
data/nfl-rookie-seasons.csv               nflverse: espn_id → rookie_season
web/src/data/rookieDraftHistory.js        the same picks, app-shaped (generated)
web/src/data/rookieDraft2026.js           the 2026 class (hand-entered, has real slots)
web/src/data/trades2026.js                2026 trades — the only trades on disk
```

Produced by:

```
web/scripts/extract-rookie-history.mjs    rookie recovery  (--write, --json)
web/scripts/import-history.mjs            CSV → Firestore
```

**The rookie draft never existed as its own event in ESPN.** There is one
draft per season in the export and the rookie picks hide inside it, because
a rookie taken in July is already on the roster when the August auction
happens. `extract-rookie-history.mjs` recovers them from a three-part
fingerprint — a real NFL rookie that season, a rookie contract price, and
evidence he was kept rather than bought. Read `ROOKIE-DRAFT-HISTORY.md`
before touching that script. Commissioner rulings live in its `RULINGS`
table; add one and re-run with `--write`.

---

## 5. The Firestore mirror

Project `iffl-auth`. `import-history.mjs` writes these from the same CSV,
so they hold nothing the CSV doesn't. Read them when you want the app's
shape; read the CSV when you want the truth.

```
historyTeamSeasons/{year}       historyDrafts/{year}
historyMatchups/{year}          historyAggregates/{scoring,draft,lineups}
historyPlayerSeasons/{year}     leagueHistory/{year}
historyPlayerWeeks/{year}-{WW}  leagueRecords/auto-*
weeklyScores/{year}             trades
```

Two notes. `historyAggregates` is **precomputed on purpose** — three charts
each need a join across all 36 draft and player-season docs (~1 MB), so the
import does the join once and the browser reads three small docs; re-run
the import after changing that math. And `leagueHistory` standings were
**rebuilt from ESPN**, correcting real errors in the hand-seeded records
(Jared's 2019 is 8-5, not 11-3).

Auth for the scripts is `gcloud auth print-access-token` plus the Firestore
REST API. **There is no `serviceAccountKey.json`.** Don't look for one, and
don't create one.

---

## 6. What is missing, and what lies

Check this list before concluding you have found a bug.

**Gaps in the data**

- **No weekly player lines before 2018.** ESPN kept none. This is permanent
  and unrecoverable — it is why bench and lineup analysis is 2018+.
- **2008 is a 10-team season**, so 190 draft rows instead of 228, and its
  standings and owners are reconstructed (§3).
- **No trades before 2026 anywhere in this repo.** `trades2026.js` has nine
  deals. Earlier trades may exist in the Firestore `trades` collection from
  a prior seeding session; nothing in the repo records them.
- **No 2026 auction.** The export stops at 2025.

**Places the data contradicts itself** — all three are real, all three are
already handled in the app, and all three will look like your bug:

- **ESPN's `Winner` column disagrees with its own `TeamScore` /
  `OpponentScore` on 7 playoff rows** (bracket bookkeeping). Convention in
  this repo: margin records derive W/L from the scores; streaks and the
  head-to-head grid use ESPN's official verdict, because that is what the
  standings were built from.
- **Starter points do not sum to `TeamScore` on 211 team-weeks.** Measure
  anything lineup-related entirely within the player lines; use the
  official score only for "would this result have changed".
- **`DraftPick` rows are keepers and auction buys mixed together**, ordered
  by `OverallPick` with the whole keeper block first. The `Keeper` flag is
  only reliable from 2020 — before that ESPN flags returning keepers but
  not rookie picks. Position in the draft record is the pre-2020 substitute.

**Joining to the NFL**

`data/nfl-rookie-seasons.csv` joins to the export on `PlayerId`
(ESPN's id) and gives a real `rookie_season`. It matches **93.5%** of draft
rows; the misses are D/ST and kickers, which have no NFL rookie season and
are never rookie picks, so the gap does not matter for that purpose. Do not
substitute "first season we see this player" for "NFL rookie" — it is wrong
for anyone who spent a year or two in the league before this league
rostered him.

---

## 7. Working on it

```bash
# from the repo root — no build needed, the CSV is just a file
node -e "…"                                   # ad-hoc queries are fine

cd web
npm test                                      # 371 tests; services are pure and tested
node scripts/extract-rookie-history.mjs       # report only
node scripts/extract-rookie-history.mjs --json --write
```

Anything analytical belongs in a pure module under `web/src/services/` with
a `.test.js` beside it, run by `node --test`. That is the house pattern:
no framework, no mocks, no browser. Follow it.

Wider project context, including the league's own rules and the history of
decisions made about this data, is in `CLAUDE.md` at the repo root — start
with the sections "Historical data" and "Rookie draft history — recovered
by fingerprint".
