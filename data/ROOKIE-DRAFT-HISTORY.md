# Rookie Draft History, 2017–2025

Companion to `rookie-draft-history-2017-2025.csv` (206 picks, one row each).
Written to be readable on its own, away from the codebase.

## The draft began in 2017

Corey Davis at 1.01 was the first rookie pick in league history. Players at
rookie-looking prices in 2013–2016 are auction buys, not picks. So this file
plus the 2026 class is the complete record; there is nothing earlier to find.

## Why it had to be recovered at all

ESPN has never recorded the rookie draft as its own event. Each season's
export holds exactly one draft — 228 rows, 19 rounds of 12 — and the rookie
picks are hidden inside it, because a rookie taken in July is simply on the
roster when the August auction happens. Every class here was reconstructed
from three signals.

**1. The player must be an actual NFL rookie that season.** Checked against
nflverse's player table joined on ESPN player id. Not "first time the league
has seen him," which is wrong for anyone who spent a year or two in the NFL
before someone rostered him.

**2. The price names the slot.** Rookie contracts were a sliding scale
through 2021 and flat from 2022:

| Season range | 1.01 | 1.02 | 1.03 | 1.04 | 1.05 | 1.06–1.12 | Round 2 |
|---|---|---|---|---|---|---|---|
| 2017–2021 | $12 | $10 | $8 | $6 | $4 | $2 | $1 |
| 2022–2025 | $2 | $2 | $2 | $2 | $2 | $2 | $1 |

So an exact slot exists only for the top five of 2017–2021. Everything else
carries a round and no slot — `slot_confidence` in the CSV says which.

**3. He must have been kept, not bought.** $1 and $2 are ordinary auction
prices too. From 2020 ESPN flags the picks as keepers and that settles it.
Before 2020 it flags the returning keepers but not the rookies, so position
in the draft record stands in: ESPN writes the keeper block first, the league
entered its rookie class immediately after it, and the live auction follows.
The picks therefore sit in one identifiable run before the first real bid.
That run is what separates a second-round pick from a dollar flyer — Patrick
Mahomes went for $1 in 2017 at overall pick 188 of 228, a hundred picks after
the run ended. It also settled two ties the prices could not: Joe Mixon (2017,
overall 134) and Tony Pollard (2019, overall 172) both sat at $4 and both were
auction buys, which leaves Dwayne Haskins holding 2019's 1.05.

## Commissioner rulings folded in

- **2018 1.05 — Ronald Jones**, not John Kelly Jr. (both were $4).
- **2020 1.05 — D'Andre Swift**, not Darrynton Evans (both were $4).
- **2018 1.03 — the pick was made and the player dropped** before the auction,
  so the slot is real and the name is gone.

## Completeness

| Season | Picks | Status |
|---|---|---|
| 2017 | 18 | six short — no 1.05 at all; open question whether year one was a full two rounds |
| 2018 | 23 | 1.03 recorded as dropped |
| 2019 | 24 | complete |
| 2020 | 22 | two short |
| 2021 | 23 | one short |
| 2022 | 25 | **one too many** — thirteen at $1 for twelve second-round slots |
| 2023 | 23 | **thirteen at $2** for twelve first-round slots, only ten in round two |
| 2024 | 24 | complete |
| 2025 | 24 | complete |

A season landing one or two short is what a dropped rookie looks like: the
pick was made, the player was cut before the auction, and he never reached
the keeper list. The two overfull seasons need a human call on which player
was not actually a pick.

## Rebuilding it

`web/scripts/extract-rookie-history.mjs` in the IFFL app repo, reading
`data/iffl_fantasy_history_2008-2025.csv` and `data/nfl-rookie-seasons.csv`.
`--write` regenerates the app's data file, `--json` dumps the full review
payload including each player's position in the ESPN draft record. Rulings
live in the script's `RULINGS` table — add one and re-run.
