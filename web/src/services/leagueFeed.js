// leagueFeed — ordering and labels for the self-publishing League Feed.
//
// The posts are written by Cloud Functions (functions/leagueFeed.js) the
// moment a week's scores or a trade lands; this file only decides how the
// browser lists them. Pure, so the order is tested rather than eyeballed.

const ms = (v) => (v == null ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : +new Date(v) || 0)

const TYPE_META = {
  week:  { glyph: '🗞️', label: 'Week in review' },
  game:  { glyph: '🏈', label: 'Game recap' },
  trade: { glyph: '🤝', label: 'Trade' },
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

/** What members see: nothing hidden, nothing empty. */
export function visibleFeed(posts) {
  return sortFeed((posts ?? []).filter((p) => p && p.hidden !== true && String(p.body ?? '').trim()))
}
