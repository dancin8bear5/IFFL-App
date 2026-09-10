// rankingsRelease — which waves of the power rankings are public.
//
// The piece drops in stages on show day: the introduction, then 12–9, then
// 8–5, then 4–1 with the full ladder. The commissioner flips each wave from
// Admin → Season and it reaches the league within seconds, because
// config/league is a live listener.
//
// The whole reason this is a module and not an inline `if`: an off-by-one
// here publishes somebody's ranking early, and there is no taking that back
// on a show built entirely around the reveal. So the mapping is written
// once, tested, and read everywhere.

/** Ordered. Index+1 is the release level that unlocks each wave. */
export const WAVES = [
  { key: 'intro', label: 'Introduction', blurb: 'The lookback, the auction, the machine' },
  { key: '12-9',  label: 'Ranks 12–9',   blurb: 'The bottom four', from: 12, to: 9 },
  { key: '8-5',   label: 'Ranks 8–5',    blurb: 'The middle four', from: 8,  to: 5 },
  { key: '4-1',   label: 'Ranks 4–1',    blurb: 'The top four, and the ladder', from: 4, to: 1 },
]

export const MAX_LEVEL = WAVES.length      // 4
export const HIDDEN = 0                    // nothing published at all

/** Anything unparseable reads as HIDDEN — never as "publish everything". */
export function normalizeLevel(value) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n <= 0) return HIDDEN
  return Math.min(n, MAX_LEVEL)
}

export function isWaveOut(level, waveKey) {
  const i = WAVES.findIndex((w) => w.key === waveKey)
  if (i < 0) return false
  return normalizeLevel(level) >= i + 1
}

/** The teams a given level may show, in the order they are published (12 → 1). */
export function releasedTeams(level, rankings) {
  const lvl = normalizeLevel(level)
  const out = []
  for (const wave of WAVES) {
    if (!wave.from || !isWaveOut(lvl, wave.key)) continue
    for (const t of rankings ?? []) {
      if (t.rank <= wave.from && t.rank >= wave.to) out.push(t)
    }
  }
  return out.sort((a, b) => b.rank - a.rank)
}

/**
 * The ladder gives away all twelve placements at once, so it rides with the
 * last wave and never a moment sooner.
 */
export function isLadderOut(level) {
  return normalizeLevel(level) >= MAX_LEVEL
}

/** Nothing at all published → the Dashboard block doesn't render. */
export function isAnythingOut(level) {
  return normalizeLevel(level) > HIDDEN
}

/** What each wave looks like to the reader: out, or still to come. */
export function waveStates(level) {
  const lvl = normalizeLevel(level)
  return WAVES.map((w, i) => ({ ...w, out: lvl >= i + 1 }))
}
