// historySearch — one search box over the league's whole paper trail.
//
// Three kinds of record live in three different shapes, in three different
// places: rookie picks (a local data file), auction picks (historyDrafts in
// Firestore) and trades (the trades collection). Asking "what happened with
// Breece Hall" should not require knowing which of those to look in.
//
// So each source is normalised into one record shape, ONCE, at index time.
// Everything after that — filtering, ranking, counting — works on that one
// shape and never needs to know where a record came from. Adding a fourth
// source later means writing one more adapter and touching nothing else.
//
// The searchable text is precomputed into `haystack` when the index is
// built rather than assembled per keystroke. A season of auction picks is
// 228 rows and there are eighteen of them; rebuilding those strings on
// every character typed is the difference between instant and laggy.

export const KINDS = ['rookie', 'auction', 'trade']

export const KIND_LABELS = {
  rookie: 'Rookie draft',
  auction: 'Auction draft',
  trade: 'Trade',
}

/** Longest list a browse (no search text) will render at once. */
export const BROWSE_LIMIT = 300

const clean = (v) => (v == null ? '' : String(v).trim())
const lower = (v) => clean(v).toLowerCase()

/**
 * Everything about a record that anyone might type, as one lowercase
 * string. Built once per record; searched many times.
 */
function haystackOf(parts) {
  return parts.filter(Boolean).map(lower).join(' ')
}

// ── adapters: three shapes in, one shape out ──────────────────

/**
 * Rookie picks, from the recovered classes (services/extract-rookie-history).
 * @param bySeason - { [season]: [{ name, position, nflTeam, team, price, slot, round, dropped }] }
 */
export function toRookieRecords(bySeason = {}) {
  const out = []
  for (const [season, picks] of Object.entries(bySeason ?? {})) {
    const yr = Number(season)
    for (const p of picks ?? []) {
      // A dropped pick has a slot and no player. It stays in the index
      // because "who held 2018's 1.03" is a real question with a real
      // answer, even though the player's name is gone.
      const label = p.slot || (p.round ? `Round ${p.round}` : 'Rookie pick')
      out.push({
        id: `rookie-${yr}-${p.slot ?? p.name ?? Math.random().toString(36).slice(2)}`,
        kind: 'rookie',
        season: yr,
        date: null,
        teams: [p.team].filter(Boolean),
        players: [p.name].filter(Boolean),
        positions: [p.position].filter(Boolean),
        price: p.price ?? null,
        slot: p.slot ?? null,
        round: p.round ?? null,
        title: p.dropped ? `${label} — dropped before the season` : clean(p.name),
        nflTeam: clean(p.nflTeam) || null,
        detail: [p.position, p.nflTeam].filter(Boolean).join(' · '),
        haystack: haystackOf([p.name, p.position, p.nflTeam, p.team, p.slot, yr, 'rookie draft']),
        raw: p,
      })
    }
  }
  return out
}

/**
 * Auction picks, from historyDrafts/{year}.
 * @param docs - [{ season, picks: [{ team, player, position, proTeam, round, overallPick, auctionPrice, keeper }] }]
 */
export function toAuctionRecords(docs = []) {
  const out = []
  for (const d of docs ?? []) {
    const yr = Number(d?.season)
    for (const p of d?.picks ?? []) {
      out.push({
        id: `auction-${yr}-${p.overallPick ?? p.player}`,
        kind: 'auction',
        season: yr,
        date: null,
        teams: [p.team].filter(Boolean),
        players: [p.player].filter(Boolean),
        positions: [p.position].filter(Boolean),
        price: p.auctionPrice ?? null,
        slot: null,
        round: p.round ?? null,
        overallPick: p.overallPick ?? null,
        keeper: Boolean(p.keeper),
        title: clean(p.player),
        nflTeam: clean(p.proTeam) || null,
        detail: [p.position, p.proTeam].filter(Boolean).join(' · '),
        // "keeper" is worth indexing as a word — it's how someone would ask
        // for the ones that weren't really bought that year.
        haystack: haystackOf([
          p.player, p.position, p.proTeam, p.team, yr, 'auction draft',
          p.keeper ? 'keeper kept' : 'bought',
        ]),
        raw: p,
      })
    }
  }
  return out
}

/**
 * Trades, from the trades collection.
 *
 * A trade is ONE record, not one per side. Splitting it would double every
 * result and make "Jared and Bill" match twice as hard as it should; the
 * cost is that both teams and every asset have to live in one haystack,
 * which they do.
 */
export function toTradeRecords(trades = []) {
  return (trades ?? [])
    .filter((t) => t && t.status !== 'proposed' && t.status !== 'cancelled' && t.status !== 'rejected')
    .map((t) => {
      const from = (t.assetsFromProposer ?? []).map((a) => clean(a?.displayName)).filter(Boolean)
      const to = (t.assetsFromReceiver ?? []).map((a) => clean(a?.displayName)).filter(Boolean)
      const a = clean(t.proposingTeamName)
      const b = clean(t.receivingTeamName)
      return {
        id: `trade-${t.id ?? `${a}-${b}-${t.season}`}`,
        kind: 'trade',
        season: Number(t.season),
        date: t.date instanceof Date ? t.date : t.date ? new Date(t.date) : null,
        teams: [a, b].filter(Boolean),
        players: [...from, ...to],
        positions: [],
        price: null,
        slot: null,
        round: null,
        title: `${a} ↔ ${b}`,
        // What each team GAVE UP. The row renders the other side of this —
        // people remember a trade by what they got — and keeping the stored
        // direction the same as the documents' own (`assetsFrom…` is what
        // that side sends) means the flip happens once, on screen, instead
        // of being half-applied in two places.
        gave: { [a]: from, [b]: to },
        detail: [from.join(', '), to.join(', ')].filter(Boolean).join('  ⇄  '),
        haystack: haystackOf([a, b, ...from, ...to, t.season, 'trade', t.notes]),
        raw: t,
      }
    })
}

/**
 * Build the searchable index from whatever sources are available.
 * A source that hasn't been seeded yet simply contributes nothing.
 */
export function buildIndex({ rookie, auction, trades } = {}) {
  return [
    ...toRookieRecords(rookie),
    ...toAuctionRecords(auction),
    ...toTradeRecords(trades),
  ]
}

// ── querying ──────────────────────────────────────────────────

/** Split what was typed into terms; every term has to match somewhere. */
export function tokenize(text) {
  return lower(text).split(/[\s,]+/).filter(Boolean)
}

/**
 * How well a record answers the query. Higher is better, 0 is no match.
 *
 * Every term must appear somewhere, so "hall 2022" narrows rather than
 * widens — a search box that returns MORE results as you type more words
 * is the classic way this feature goes wrong.
 */
export function scoreRecord(record, terms) {
  if (terms.length === 0) return 1
  const hay = record.haystack ?? ''
  const names = record.players.map(lower)
  let score = 0
  for (const t of terms) {
    if (!hay.includes(t)) return 0
    const word = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    // Matching a player's NAME beats matching anything else, and a surname
    // counts every bit as much as a first name — people search "Faulk", not
    // "Marshall Faulk", so testing only the start of the whole string would
    // rank him level with a team abbreviation that happens to contain the
    // same letters.
    if (names.some((n) => n === t)) score += 6
    else if (names.some((n) => n.startsWith(t))) score += 5
    else if (names.some((n) => word.test(n))) score += 4
    else if (word.test(hay)) score += 2
    else score += 1
  }
  return score
}

/**
 * Filter and rank the index.
 *
 * @param query - { text, kinds, seasonFrom, seasonTo, teams, positions }
 *   Every field is optional; an absent filter means "don't filter on this".
 * @returns { results, total, counts } — counts are per kind BEFORE the
 *   kind filter, so the kind chips can show how much each one holds
 *   without the selected chip zeroing out the others.
 */
export function searchHistory(index = [], query = {}) {
  const {
    text = '', kinds = null, seasonFrom = null, seasonTo = null,
    teams = null, positions = null, limit = BROWSE_LIMIT,
  } = query

  const terms = tokenize(text)
  const teamSet = teams?.length ? new Set(teams) : null
  const posSet = positions?.length ? new Set(positions) : null
  const kindSet = kinds?.length ? new Set(kinds) : null

  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]))
  const scored = []

  for (const r of index) {
    if (seasonFrom != null && r.season < seasonFrom) continue
    if (seasonTo != null && r.season > seasonTo) continue
    if (teamSet && !r.teams.some((t) => teamSet.has(t))) continue
    if (posSet && !r.positions.some((p) => posSet.has(p))) continue
    const score = scoreRecord(r, terms)
    if (score === 0) continue
    // Counted before the kind filter so the chips keep reading true.
    if (counts[r.kind] != null) counts[r.kind] += 1
    if (kindSet && !kindSet.has(r.kind)) continue
    scored.push({ record: r, score })
  }

  // Score first, then newest, then a stable tiebreak on id — without the
  // last one two equally-good results can swap places between renders.
  scored.sort((a, b) =>
    b.score - a.score ||
    b.record.season - a.record.season ||
    (b.record.date?.getTime() ?? 0) - (a.record.date?.getTime() ?? 0) ||
    a.record.id.localeCompare(b.record.id))

  return {
    results: scored.slice(0, limit).map((s) => s.record),
    total: scored.length,
    counts,
  }
}

/** Seasons present in the index, newest first — for the range control. */
export function seasonsIn(index = []) {
  return [...new Set(index.map((r) => r.season).filter(Number.isFinite))].sort((a, b) => b - a)
}
