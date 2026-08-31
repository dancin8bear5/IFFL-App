// routing — the URL hash ↔ tab mapping.
//
// The app has no router. For a seven-tab SPA where every screen reads the
// same live data, a router would mostly be ceremony. What was actually
// missing is smaller: a way to link someone straight to a screen, and a
// back button that steps between tabs instead of leaving the app.
//
// So: the hash IS the route. `#rosters` selects the Rosters tab, the tab
// writes itself back to the hash, and the browser's own history does the
// rest. Deep-linking an OVERLAY (a player card, a trade, an admin
// section) is deliberately out of scope — those are transient state, and
// routing them would mean serialising modal stacks for very little gain.
//
// Pure functions only, so the mapping is testable without a DOM.

/**
 * Older or alternate names that should still resolve, so a link shared in
 * GroupMe keeps working after a tab is renamed. `#board` shipped before
 * this module existed and is already in use.
 */
export const SLUG_ALIASES = {
  market: 'trades',      // the tab was "F.M.K. Market" before F.M.K. was hidden
  fmk: 'trades',
  team: 'worksheet',
  myteam: 'worksheet',
}

/**
 * Reduce whatever is in `window.location.hash` to a bare slug.
 * Tolerates '#rosters', '#/rosters', 'rosters', '#Rosters', '' and null,
 * plus any query/sub-path a link might pick up along the way.
 * @returns the canonical slug, or '' when there's nothing usable
 */
export function normalizeHash(hash) {
  return parseRoute(hash).slug
}

/**
 * Split a hash into its tab slug and optional parameter.
 * `#rosters/a-zurek` → { slug: 'rosters', param: 'a-zurek' }
 *
 * Only Rosters uses the parameter today — it names the team whose roster
 * to open, which is what makes "here's Bill's roster" a real link rather
 * than an instruction to go and click something.
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .split('&')[0]
    .split('/')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  const raw = parts[0] ?? ''
  return {
    slug: raw ? (SLUG_ALIASES[raw] ?? raw) : '',
    param: parts[1] ?? '',
  }
}

/**
 * A team name as a URL segment. "A. Zurek" → "a-zurek".
 *
 * Punctuation is dropped rather than encoded so links stay readable and
 * survive being pasted through chat apps, which love to mangle %-escapes.
 */
export function teamSlug(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve a URL segment back to a real team name.
 * Returns '' when nothing matches — the caller shows the roster it already
 * had rather than a blank team.
 */
export function teamFromSlug(slug, teams) {
  const wanted = teamSlug(slug)
  if (!wanted) return ''
  return (teams ?? []).find((t) => teamSlug(t.name) === wanted)?.name ?? ''
}

/** The shareable hash for one team's roster. */
export function rosterHash(teamName) {
  const t = teamSlug(teamName)
  return t ? `#rosters/${t}` : '#rosters'
}

/**
 * The slug for a tab index.
 * @param tabs - the ordered tab definitions, each optionally carrying `slug`
 * @returns the slug, or '' if that tab has none (it isn't linkable)
 */
export function slugForTab(tabs, index) {
  return tabs?.[index]?.slug ?? ''
}

/**
 * The tab index a slug points at.
 *
 * Returns -1 rather than 0 for anything unknown: a typo'd link should be
 * an explicit miss the caller decides how to handle, not a silent
 * redirect to the Dashboard that looks like the link worked.
 */
export function tabForSlug(tabs, slug) {
  const wanted = normalizeHash(slug)
  if (!wanted) return -1
  return (tabs ?? []).findIndex((t) => t.slug === wanted)
}

/** Every linkable slug, for docs and tests. */
export function allSlugs(tabs) {
  return (tabs ?? []).map((t) => t.slug).filter(Boolean)
}
