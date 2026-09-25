// archive — which editions are current, which have retired, and how much of
// a retired one is readable.
//
// Pure: every function takes the article index (data/articles.js) as an
// argument rather than importing it, so the tests run on fixtures and no
// screen pulls the whole corpus in by touching this file.
import { DROP_KEYS, normalizeReleased } from './rankingsRelease.js'

/** Newest first. Season decides; a tie holds the written order. */
function bySeason(a, b) {
  return (b.season ?? 0) - (a.season ?? 0)
}

/**
 * The edition of a kind that is CURRENT — the newest one, which is the one
 * the Dashboard shows.
 */
export function currentArticle(articles, kind) {
  return [...(articles ?? [])].filter((a) => a?.kind === kind).sort(bySeason)[0] ?? null
}

/**
 * Everything that is not the newest of its kind, newest first.
 *
 * One entry per kind is always missing from this list, by construction —
 * the archive is what is NO LONGER on the Dashboard, so an app with one
 * edition of each kind has an empty archive, and the tile that opens it
 * stays hidden until the first edition ages out.
 */
export function archivedArticles(articles) {
  const list = (articles ?? []).filter((a) => a?.kind && a?.id)
  const current = new Set(
    [...new Set(list.map((a) => a.kind))].map((k) => `${k}:${currentArticle(list, k)?.id}`),
  )
  return list.filter((a) => !current.has(`${a.kind}:${a.id}`)).sort(bySeason)
}

export function hasArchive(articles) {
  return archivedArticles(articles).length > 0
}

/** The archived editions grouped by season, newest season first. */
export function archiveBySeason(articles) {
  const out = new Map()
  for (const a of archivedArticles(articles)) {
    if (!out.has(a.season)) out.set(a.season, [])
    out.get(a.season).push(a)
  }
  return [...out.entries()].map(([season, items]) => ({ season, items }))
}

/**
 * Which drops of a Power Rankings edition may be shown.
 *
 * The release gate applies to the CURRENT edition only. A retired edition
 * opens completely, including sections that were never released: the
 * embargo was about the order of a reveal, and once an edition is no longer
 * the current one that reveal is over. The commissioner asked for exactly
 * this, and it is one rule in one place rather than a condition in the view
 * — everything downstream (which drops are FETCHED, which sections render,
 * whether the grade sheet appears) already derives from this one list.
 *
 * A malformed release list on a CURRENT edition still reads as nothing
 * released, never as everything: rankingsRelease fails closed and this must
 * not quietly undo that.
 */
export function releasedFor(edition, currentEdition, released) {
  const isCurrent = !currentEdition || String(edition) === String(currentEdition)
  return isCurrent ? normalizeReleased(released) : [...DROP_KEYS]
}

// ── deep links ───────────────────────────────────────────────
//
// `#power-rankings/2025-preseason/wayne-vh` — the edition segment is
// optional, and older links that name only a team still work.
//
// Edition ids use underscores (they are Firestore document ids);
// URL segments use hyphens, because a URL should survive being pasted
// through a chat app that treats an underscore as formatting.

export const editionSlug = (id) => String(id ?? '').replace(/_/g, '-').toLowerCase()

/**
 * Split a power-rankings route into the edition it names and the team card
 * it opens. Either may be absent.
 *
 * Which segment is which is decided by matching against the known
 * editions, not by counting: `#power-rankings/wayne-vh` has one segment and
 * it is a team, while `#power-rankings/2025-preseason` has one segment and
 * it is an edition.
 */
export function rankingsDeepLink(params, articles) {
  const parts = (Array.isArray(params) ? params : []).filter(Boolean).map(String)
  const editions = (articles ?? []).filter((a) => a?.kind === 'rankings')
  const match = parts.find((p) => editions.some((e) => editionSlug(e.id) === p.toLowerCase()))
  const edition = match
    ? editions.find((e) => editionSlug(e.id) === match.toLowerCase()).id
    : null
  const team = parts.filter((p) => p !== match).pop() ?? null
  return { edition, team }
}
