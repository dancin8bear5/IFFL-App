// leagueFeed — ordering and labels for the self-publishing League Feed.
//
// The posts are written by Cloud Functions (functions/leagueFeed.js) the
// moment a week's scores or a trade lands; this file only decides how the
// browser lists them. Pure, so the order is tested rather than eyeballed.

import { isAged } from './archive.js'

const ms = (v) => (v == null ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : +new Date(v) || 0)

const TYPE_META = {
  week:  { glyph: '🗞️', label: 'Week in review' },
  game:  { glyph: '🏈', label: 'Game recap' },
  trade: { glyph: '🤝', label: 'Trade' },
  record: { glyph: '🏆', label: 'League record' },
  milestone: { glyph: '🗓️', label: 'Calendar' },
}

/** Glyph + the small line above a post's title. Unknown types still render. */
export function feedMeta(post) {
  const m = TYPE_META[post?.type] ?? { glyph: '📰', label: 'League news' }
  return { glyph: m.glyph, kicker: post?.week ? `Week ${post.week} · ${m.label}` : m.label }
}

/**
 * Newest first. Posts from the same week publish within the same second, so
 * within a week the review leads its games, and games fall back to title —
 * otherwise seven cards reshuffle on every snapshot.
 */
export function sortFeed(posts) {
  const rank = (p) => (p.type === 'week' ? 0 : p.type === 'game' ? 1 : 2)
  return [...(posts ?? [])].sort((a, b) => {
    const wa = a.week ?? null, wb = b.week ?? null
    if (wa != null && wb != null && wa === wb && a.season === b.season) {
      return rank(a) - rank(b) || String(a.title).localeCompare(String(b.title))
    }
    return ms(b.publishedAt) - ms(a.publishedAt) || String(a.id).localeCompare(String(b.id))
  })
}

/**
 * The feed splits at two weeks, like every other thing the league publishes
 * (ARCHIVE_AFTER_DAYS in services/archive.js): `recent` is the Dashboard
 * rail, `past` is the archive page. A post with no readable date counts as
 * recent — it was just written and its timestamp hasn't landed yet.
 */
export function splitFeed(posts, now = Date.now()) {
  const all = visibleFeed(posts)
  const stale = staleWeekPosts(all)
  const past = (p) => stale.has(p) || isAged(p.publishedAt, now)
  return { recent: all.filter((p) => !past(p)), past: all.filter(past) }
}

/**
 * Matchup write-ups are only news for ONE week (commissioner, Nov 25, 2026):
 * the rail carries the most recent week's game recaps and week-in-review,
 * and the moment a newer week's land, the older ones go to the archive —
 * however young they are. Decided by season + week, never by date, so a
 * backfilled or re-run week can't push its way into the rail.
 */
const weekKey = (p) => Number(p.season) * 100 + Number(p.week)
const isWeekPost = (p) => (p.type === 'game' || p.type === 'week') && Number.isFinite(weekKey(p)) && p.week != null
function staleWeekPosts(all) {
  const weekly = all.filter(isWeekPost)
  const latest = Math.max(...weekly.map(weekKey))
  return new Set(weekly.filter((p) => weekKey(p) < latest))
}

/** What members see: nothing hidden, nothing empty. */
export function visibleFeed(posts) {
  return sortFeed((posts ?? []).filter((p) => p && p.hidden !== true && String(p.body ?? '').trim()))
}
