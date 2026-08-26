// 2026 trade log — transcribed verbatim from the "2026 IFFL Keeper Master
// List" Google Sheet's trade tab, every deal dated Feb 1 2026 or later (the
// rows above the sheet's own "END OF 2025 SEASON" divider).
//
// IMPORTANT — the sheet records what each side RECEIVED. That's the opposite
// of the app's `assetsFromProposer` / `assetsFromReceiver`, which are what
// each side SENDS. The flip happens once, in seedHistoricalTrades(). Keep
// this file in the sheet's own shape so it stays diffable against the source.
//
// These import as status 'historical': ledger entries only. Rosters already
// reflect these trades, so nothing here moves a player or a pick.

/** Sheet rows, newest first. `a`/`b` are the sheet's two team columns. */
export const trades2026 = [
  {
    date: '2026-08-16',
    a: { team: 'Jared',   received: ['KaVontae Turpin', '2027 2nd (Jason)'] },
    b: { team: 'Jason',   received: ['Dak Prescott'] },
  },
  {
    date: '2026-08-04',
    a: { team: 'Dugan',   received: ['2027 1st (M. Zurek)'] },
    b: { team: 'M. Zurek', received: ['2027 1st (Dugan)'] },
  },
  {
    date: '2026-05-31',
    a: { team: 'Jason',   received: ['Jonathan Brooks'] },
    b: { team: 'M. Zurek', received: ['Rico Dowdle'] },
  },
  {
    date: '2026-05-23',
    a: { team: 'Wayne',   received: ['Trey McBride'] },
    b: { team: 'M. Zurek', received: ["De'Von Achane"] },
  },
  {
    date: '2026-05-04',
    a: { team: 'Bill',    received: ['Michael Wilson'] },
    b: { team: 'M. Zurek', received: ['Justin Herbert'] },
  },
  {
    date: '2026-04-15',
    a: { team: 'Faybik',  received: ['Jaylen Waddle'] },
    b: { team: 'Bill',    received: ['Javonte Williams'] },
  },
  {
    // Same day as the trade below: Faybik acquires A. Zurek's 1.02 and flips
    // it to Jared. Two separate rows in the sheet, two separate trades here.
    date: '2026-04-02',
    a: { team: 'Faybik',  received: ['Bijan Robinson', '2026 2.10 (Jason)'] },
    b: { team: 'Jared',   received: ['2026 1.02 (A. Zurek)', 'Trey Lance'] },
  },
  {
    date: '2026-04-02',
    a: { team: 'Faybik',  received: ['2026 1.02 (A. Zurek)', '2026 2.04 (Ryan)', 'Emari Demercado'] },
    b: { team: 'A. Zurek', received: ['Jaxon Smith-Njigba'] },
  },
]

/**
 * Draft picks in the sheet are always "<year> <round>" — either "2027 2nd"
 * or the resolved slot form "2026 1.02" — optionally trailed by the
 * originating team in parens. Anything else is a player's name.
 */
const PICK_RE = /^\d{4}\s+(?:\d+(?:st|nd|rd|th)\b|\d+\.\d+)/

export function assetTypeOf(displayName) {
  return PICK_RE.test(displayName) ? 'draftPick' : 'player'
}

/**
 * Break a pick's display name into something resolvable against a
 * draftPicks doc: "2027 2nd (Jason)" → {season: 2027, round: 2, slot: null,
 * originalTeam: 'Jason'}, "2026 1.02 (A. Zurek)" → {..., round: 1, slot: 2}.
 *
 * The parenthetical is the team the pick ORIGINALLY belonged to, which is
 * what makes it identifiable — every team owns exactly one pick per round
 * per season, so season + round + original owner is unique. Returns null
 * for anything that isn't a pick or is missing its original owner, and the
 * caller treats null as "don't guess".
 */
export function parsePickRef(displayName) {
  const m = /^(\d{4})\s+(?:(\d+)(?:st|nd|rd|th)|(\d+)\.(\d+))\s*(?:\(([^)]+)\))?\s*$/.exec(
    displayName ?? '',
  )
  if (!m) return null
  const [, year, plainRound, dottedRound, slot, team] = m
  if (!team) return null
  return {
    season: Number(year),
    round: Number(plainRound ?? dottedRound),
    slot: slot != null ? Number(slot) : null,
    originalTeam: team.trim(),
  }
}

/**
 * Every pick that changed hands across `rows`, oldest trade first.
 *
 * Order matters: the 2026 1.02 moved A. Zurek → Faybik → Jared on a single
 * afternoon, so applying these out of order would leave it with the wrong
 * owner. Callers must preserve this sequence.
 */
export function pickTransfers(rows = trades2026) {
  const out = []
  for (const row of [...rows].reverse()) {
    for (const [side, other] of [[row.a, row.b], [row.b, row.a]]) {
      for (const name of side.received) {
        const ref = parsePickRef(name)
        if (ref) out.push({ ref, displayName: name, toTeam: side.team, fromTeam: other.team, date: row.date })
      }
    }
  }
  return out
}
