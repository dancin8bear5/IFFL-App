// rankingsRelease — which drops of the Power Rankings are public.
//
// The piece lands in three drops (#12-9 → #8-5 → #4-1). The commissioner
// flips a drop live; nobody redeploys. This module owns the mapping and
// nothing else, because an off-by-one here publishes somebody's ranking
// early and there is no taking that back on a document built entirely
// around the reveal.
//
// The release list is an ARRAY OF DROP KEYS, matching the generated
// payload's `released[]`. It is deliberately not an integer level: the
// payload is the source of truth and the app should speak its language.
//
// NOTE ON THE PAYLOAD. data/powerRankings2026.json is generated upstream by
// power_rankings.py and must never be hand-edited — its own `released`
// field is treated as a DEFAULT that app config overrides, so staging the
// drops touches no generated content.

/** In publication order. The keys match the payload's `drops` object. */
export const DROPS = [
  { key: '12-9', label: 'Ranks 12–9', from: 12, to: 9 },
  { key: '8-5', label: 'Ranks 8–5', from: 8, to: 5 },
  { key: '4-1', label: 'Ranks 4–1', from: 4, to: 1 },
]

export const DROP_KEYS = DROPS.map((d) => d.key)

/**
 * Anything that isn't a recognised drop key is dropped, and anything that
 * isn't a list at all reads as NOTHING RELEASED. Never as "publish
 * everything" — a malformed value must fail closed.
 */
export function normalizeReleased(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set(value.filter((k) => DROP_KEYS.includes(k)))
  return DROP_KEYS.filter((k) => seen.has(k))
}

export function isDropOut(released, key) {
  return normalizeReleased(released).includes(key)
}

/** Every drop with its release state, in publication order. */
export function dropStates(released) {
  const out = normalizeReleased(released)
  return DROPS.map((d) => ({ ...d, out: out.includes(d.key) }))
}

/**
 * The teams a given release list may show, 12 → 1.
 *
 * Sorted on `rank` and never on `score`: two placements deliberately
 * contradict the weighted number (Dugan #2 over Faybik #3 on an identical
 * 3.110, and Cantone #5 above two teams that outscore him). Sorting on
 * score would silently "fix" an editorial decision.
 */
export function releasedTeams(released, drops) {
  const out = []
  for (const key of normalizeReleased(released)) {
    for (const team of drops?.[key]?.teams ?? []) out.push(team)
  }
  return out.sort((a, b) => b.rank - a.rank)
}

/** Ranks whose team is public — the ladder names these and locks the rest. */
export function releasedRanks(released) {
  const ranks = new Set()
  for (const d of DROPS) {
    if (!isDropOut(released, d.key)) continue
    for (let r = d.to; r <= d.from; r++) ranks.add(r)
  }
  return ranks
}

export function isAnythingOut(released) {
  return normalizeReleased(released).length > 0
}
