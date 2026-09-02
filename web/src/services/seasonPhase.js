// seasonPhase — where the league is in its year, derived from the calendar.
//
// The app used to know one thing about the season: a manual `isOffSeason`
// boolean the commissioner flipped by hand. That is one bit for a year that
// actually has five distinct shapes, and it had to be remembered twice a
// year or the app quietly lied.
//
// So the phase is COMPUTED, from the same `milestones` list the calendar
// strip already renders. Five milestones carry a `phase` key; each one
// opens a phase and runs until the next one. Nothing else has to be kept
// in sync, because there is nothing else — move the Rookie Draft date and
// pre-season moves with it.
//
// Pure module: no Firebase, no React, no clock of its own. `now` is always
// passed in, which is what makes the whole thing testable and what makes
// the "view as" preview a one-argument change.

/** In calendar order. The cycle wraps from the last back to the first. */
export const PHASES = ['preseason', 'regular', 'playoffs', 'dead', 'offseason']

export const PHASE_META = {
  preseason: {
    label: 'Pre-season',
    glyph: '🎓',
    color: '#A855F7',
    blurb: 'Rookie draft, keepers and the auction — rosters are built now.',
  },
  regular: {
    label: 'Regular Season',
    glyph: '🏈',
    color: '#22C55E',
    blurb: 'Games are being played. Trades run until the deadline.',
  },
  playoffs: {
    label: 'Playoffs',
    glyph: '🥊',
    color: '#E63946',
    blurb: 'Weeks 15–17. Eight teams left.',
  },
  dead: {
    label: 'Dead Period',
    glyph: '🧊',
    color: '#38BDF8',
    blurb: 'Rosters are frozen. The league reopens the day after the Super Bowl.',
  },
  offseason: {
    label: 'Off-season',
    glyph: '🔓',
    color: '#4ADE80',
    blurb: 'The league year is open: trades, rules and rookie picks.',
  },
}

// The safe default. Not `offseason`, which is the most PERMISSIVE phase —
// if the calendar is missing or malformed we would rather show the closed
// league than open a trade window against dates we can't read.
export const FALLBACK_PHASE = 'dead'

const DAY = 86400000

/**
 * The five phase-opening milestones, sorted, or null if the calendar
 * can't be trusted: each phase must appear exactly once and they must
 * fall in PHASES order. A calendar that fails either test is a data bug,
 * and guessing around it would put the app in a phase nobody chose.
 */
export function phaseAnchors(milestones) {
  const anchors = (milestones ?? [])
    .filter((m) => m?.phase && m.date instanceof Date && !Number.isNaN(+m.date))
    .map((m) => ({ phase: m.phase, date: m.date, name: m.name }))
    .sort((a, b) => a.date - b.date)
  if (anchors.length !== PHASES.length) return null
  for (let i = 0; i < PHASES.length; i++) {
    if (anchors[i].phase !== PHASES[i]) return null
  }
  return anchors
}

/**
 * The calendar covers ONE cycle (July → the following May). Shifting the
 * whole set by whole years turns it into a repeating annual one, so a date
 * outside the written cycle still lands in the right phase instead of
 * falling off the end.
 *
 * Shifting keeps the anchors' relative order because every anchor moves by
 * the same amount — including the ones that already sit in the next
 * calendar year, which is what makes the New Year wrap work.
 *
 * It also means the model DRIFTS if the calendar isn't updated: the Super
 * Bowl moves about a week a year, and this repeats last year's date. That
 * is the commissioner override's job, and the reason the boundary is a
 * milestone rather than a constant.
 */
function expand(anchors, years = [-2, -1, 0, 1, 2]) {
  const out = []
  for (const y of years) {
    for (const a of anchors) {
      const d = new Date(a.date)
      d.setFullYear(d.getFullYear() + y)
      out.push({ ...a, date: d })
    }
  }
  return out.sort((x, z) => x.date - z.date)
}

/** Which phase does `now` fall in, by the calendar alone? */
export function phaseFor(now, milestones) {
  const anchors = phaseAnchors(milestones)
  if (!anchors) return FALLBACK_PHASE
  const t = +now
  if (!Number.isFinite(t)) return FALLBACK_PHASE
  const all = expand(anchors)
  let current = null
  for (const a of all) {
    if (+a.date <= t) current = a
    else break
  }
  return current ? current.phase : FALLBACK_PHASE
}

/**
 * The phase the app should actually render.
 *
 * `override` is the commissioner's league-wide setting (config/league
 * .phaseOverride) or a per-browser `?phase=` preview. Anything that isn't
 * a real phase name — including the empty string the Admin toggle writes
 * when it's cleared — falls through to the calendar.
 */
export function resolvePhase(now, milestones, override) {
  if (override && PHASES.includes(override)) return override
  return phaseFor(now, milestones)
}

/**
 * Does a surface declaring `declared` belong in `phase`?
 *
 * No declaration means every phase — which is the omnipresent default, and
 * why most tabs and Dashboard sections say nothing at all.
 */
export function inPhase(declared, phase) {
  if (!declared || declared.length === 0) return true
  return declared.includes(phase)
}

/** When does the current phase end / the next one open? */
export function phaseBounds(now, milestones) {
  const anchors = phaseAnchors(milestones)
  if (!anchors) return null
  const all = expand(anchors)
  const t = +now
  let start = null
  let next = null
  for (let i = 0; i < all.length; i++) {
    if (+all[i].date <= t) start = all[i]
    else { next = all[i]; break }
  }
  if (!start || !next) return null
  return {
    phase: start.phase,
    start: start.date,
    end: next.date,
    next: next.phase,
    daysLeft: Math.ceil((+next.date - t) / DAY),
  }
}

/**
 * The next thing on the calendar, for a countdown. Year-shifted like the
 * anchors, so the strip never runs dry at the end of the written cycle.
 */
export function nextMilestone(now, milestones) {
  const t = +now
  if (!Number.isFinite(t)) return null
  let best = null
  for (const m of milestones ?? []) {
    if (!(m?.date instanceof Date) || Number.isNaN(+m.date)) continue
    for (const y of [0, 1, 2]) {
      const d = new Date(m.date)
      d.setFullYear(d.getFullYear() + y)
      if (+d > t && (!best || +d < +best.date)) best = { ...m, date: d }
    }
  }
  return best
}

/**
 * `isOffSeason` for the six places that already read it. Preserves today's
 * meaning exactly — "the league is not playing games" — so the migration
 * needed no per-call-site judgement. Pre-season is NOT included: the app
 * has always shown the keeper and auction surfaces then, and it still does.
 */
export function isOffSeasonPhase(phase) {
  return phase === 'offseason' || phase === 'dead'
}
