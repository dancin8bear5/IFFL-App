// defaultTab — which tab the app opens on, stored by SLUG.
//
// The setting used to be a position: the picker listed
// ['Dashboard', 'Rosters', 'Market', 'League'] and saved 0–3, and App.jsx
// handed that number straight to setTab. Then the tab list changed under
// it — Players was inserted at 2 and the League tab was retired — so
// "Market" opened Players and "League" opened Trades. Nothing was wrong
// with either file on its own; a number just isn't a name.
//
// A slug is the same key the URL already uses (#rosters), so it keeps
// pointing at the same tab however the list is reordered.

/** What the picker offers. Slugs must exist in TabLayout's TABS. */
export const DEFAULT_TAB_CHOICES = [
  { slug: 'dashboard', label: 'Dashboard' },
  { slug: 'rosters', label: 'Rosters' },
  { slug: 'players', label: 'Players' },
  { slug: 'trades', label: 'Trades' },
]

// What each OLD number meant when it was saved, by the label the member
// actually chose — not by where that index points today. "League" has no
// tab any more; its standings and history moved to the Dashboard.
const LEGACY_INDEX_TO_SLUG = ['dashboard', 'rosters', 'trades', 'dashboard']

const KNOWN = new Set(DEFAULT_TAB_CHOICES.map((c) => c.slug))

/**
 * The slug to open on. A saved slug wins; an old numeric `defaultTab` is
 * read by what it used to be called; anything else is the Dashboard.
 */
export function defaultTabSlug(settings) {
  const slug = settings?.defaultTabSlug
  if (typeof slug === 'string' && KNOWN.has(slug)) return slug
  const legacy = settings?.defaultTab
  if (Number.isInteger(legacy)) return LEGACY_INDEX_TO_SLUG[legacy] ?? 'dashboard'
  return 'dashboard'
}
