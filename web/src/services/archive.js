// archive — which editions are current, which have retired, and how much of
// a retired one is readable.
//
// Pure: every function takes the article index (data/articles.js) as an
// argument rather than importing it, so the tests run on fixtures and no
// screen pulls the whole corpus in by touching this file.
import { DROP_KEYS, normalizeReleased } from './rankingsRelease.js'

/**
 * How long anything stays on the Dashboard before it moves to the archive.
 * ONE number for every kind of thing the league publishes — rankings, odds,
 * League Feed posts, and whatever is added next — so "why is this still on
 * the front page" always has the same answer.
 */
export const ARCHIVE_AFTER_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** A Firestore Timestamp, a Date, an ISO string or a number → ms, or null. */
export function toMs(v) {
  if (v == null) return null
  if (typeof v.toMillis === 'function') return v.toMillis()
  // Strings must be ISO (2026-09-01…). Date.parse is far too forgiving to
  // trust with anything else — V8 reads "September 2026?" as a real date.
  if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const t = v instanceof Date ? +v : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}

/**
 * Has this been out for more than two weeks?
 *
 * A date that can't be read is NOT aged. The alternative — treating "unknown"
 * as "old" — would make a typo in one date silently pull the newest piece off
 * the Dashboard. archive.test.js instead requires every article to carry a
 * readable `publishedAt`, so the unknown case can't ship.
 */
export function isAged(publishedAt, now = Date.now()) {
  const t = toMs(publishedAt)
  return t != null && toMs(now) - t > ARCHIVE_AFTER_DAYS * DAY_MS
}

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
 * The edition of a kind the DASHBOARD should show right now, or null.
 *
 * Two ways off the Dashboard (Nov 25, 2026): a newer edition replaced it, or
 * it has simply been out for more than ARCHIVE_AFTER_DAYS. The second rule is
 * new — without it the preseason rankings and odds sat at the top of the rail
 * in week 12, which is the "preseason document still leading the Dashboard
 * in March" problem with a shorter fuse.
 */
export function dashboardArticle(articles, kind, now = Date.now()) {
  const cur = currentArticle(articles, kind)
  return cur && !isAged(cur.publishedAt, now) ? cur : null
}

/**
 * Everything that is not on the Dashboard, newest first: every edition that
 * has been replaced, plus the current one of a kind once it has aged out.
 */
export function archivedArticles(articles, now = Date.now()) {
  const list = (articles ?? []).filter((a) => a?.kind && a?.id)
  const shown = new Set(
    [...new Set(list.map((a) => a.kind))]
      .map((k) => dashboardArticle(list, k, now))
      .filter(Boolean)
      .map((a) => `${a.kind}:${a.id}`),
  )
  return list.filter((a) => !shown.has(`${a.kind}:${a.id}`)).sort(bySeason)
}

export function hasArchive(articles, now = Date.now()) {
  return archivedArticles(articles, now).length > 0
}

/** The archived editions grouped by season, newest season first. */
export function archiveBySeason(articles, now = Date.now()) {
  const out = new Map()
  for (const a of archivedArticles(articles, now)) {
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
 *
 * AGE DOES NOT UNLOCK. "Retired" here means REPLACED by a newer edition —
 * never merely older than ARCHIVE_AFTER_DAYS. The newest edition moves to
 * the archive page after two weeks, but it is still the current edition and
 * its unreleased sections stay locked there. If age unlocked, the embargo
 * would expire by itself fourteen days after the first drop.
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
