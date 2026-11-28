# IFFL terms — the commissioner's rulings (Nov 27, 2026)

Every answer crew is handed this file. A term that is NOT defined here and
that changes the answer is not yours to define: the analyst stops and asks.

## Money
- **Auction price** — the amount paid for a player in the auction.
- **Keeper price** — the price paid to keep a player on your roster instead
  of letting him go to auction. In `players.json` it is `prices[<season>]`
  for a player whose `purchaseYear` is before that season.
- **Kept player (in season S)** — on a roster, `purchaseYear` < S, and not an
  in-season waiver pickup of S. Auction buys and rookie picks made in S are
  not kept players in S.
- Next year's price = this year's price + $5 × contract year
  (contract year = season − purchaseYear + 1). A kept waiver pickup enters at $2.

## Keeper value
- Lowest price with highest output is the ideal player.
- **Who counts:** kept players only.
- **Output:** total fantasy points for the season, started or benched.
  While a season is in progress, that means points SO FAR — every week
  scraped to date (ruled Nov 27, 2026). Say which week it runs through, and
  that the ranking can still move. The average starter uses the same weeks.
- **Rank by:** points above the average starter at his position, divided by
  keeper price.
- **Average starter at a position:** the mean season total of the top N
  players at that position, where N is how many players at that position the
  league starts in a typical week (the median weekly count of started players
  at that position, flex included).
- Show plain points per dollar beside it, but do not rank by it.

## Analyze a trade
- **Points:** what each side's players scored since the trade date, counting
  only the weeks they were started. Bench points are shown separately.
- **Cap:** how each team's committed dollars changed, this season and next.
- **Picks:** listed with round, and slot if known. No point value until used.
- **Verdict:** one paragraph, after the numbers.
- TMR rankings are not used.

## Scores against a team, by position
- **Who counts:** players who were started, including one in a flex slot.
- **The number:** total points per game at that position scored AGAINST the
  team, beside the league average for the same weeks. Points per player too.
- **Seasons:** the current season unless another is asked for. Weekly player
  lines exist from 2018 only.
- The same rule serves QB, RB, WR and TE.

## What the data can and cannot say
- `players.json` is TODAY'S rosters and prices. A player kept in August and
  dropped since is not on it — say so when it matters.
- The history CSV has every lineup and score by week (`PlayerWeek`,
  `TeamWeek`), and drafts through 2025. It has no 2026 draft rows.
- Team names in the CSV are ESPN's; `espn-team-identity-map.json` names the
  owner for each season. Owners are how the commissioner asks.
