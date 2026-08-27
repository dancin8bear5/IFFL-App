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
  bigboard: 'board',
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
  const raw = String(hash ?? '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split(/[/?&]/)[0]
    .trim()
    .toLowerCase()
  if (!raw) return ''
  return SLUG_ALIASES[raw] ?? raw
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
