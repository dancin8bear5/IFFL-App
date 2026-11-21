import test from 'node:test'
import assert from 'node:assert/strict'
import { feedMeta, sortFeed, visibleFeed } from './leagueFeed.js'

const t = (n) => ({ toMillis: () => n })
const posts = [
  { id: 'g2', type: 'game', season: 2026, week: 11, title: 'Ryan 101, Abad 100.1', body: 'x', publishedAt: t(500) },
  { id: 'w', type: 'week', season: 2026, week: 11, title: 'Week 11 in review', body: 'x', publishedAt: t(500) },
  { id: 'g1', type: 'game', season: 2026, week: 11, title: 'Jared 141, Bill 99', body: 'x', publishedAt: t(500) },
  { id: 'tr', type: 'trade', season: 2026, week: null, title: 'Trade', body: 'x', publishedAt: t(900) },
  { id: 'old', type: 'week', season: 2026, week: 10, title: 'Week 10 in review', body: 'x', publishedAt: t(100) },
]

test('newest first; within a week the review leads and games hold a stable order', () => {
  assert.deepEqual(sortFeed(posts).map((p) => p.id), ['tr', 'w', 'g1', 'g2', 'old'])
  assert.deepEqual(sortFeed([...posts].reverse()).map((p) => p.id), ['tr', 'w', 'g1', 'g2', 'old'])
})

test('visibleFeed drops hidden and empty posts', () => {
  const out = visibleFeed([...posts, { id: 'h', type: 'game', hidden: true, body: 'x' }, { id: 'e', type: 'game', body: '  ' }, null])
  assert.equal(out.length, 5)
})

test('dates may be Timestamps, Dates or missing', () => {
  const out = sortFeed([{ id: 'a', publishedAt: new Date(5) }, { id: 'b' }, { id: 'c', publishedAt: t(9) }])
  assert.deepEqual(out.map((p) => p.id), ['c', 'a', 'b'])
})

test('feedMeta labels each type and survives an unknown one', () => {
  assert.equal(feedMeta(posts[0]).kicker, 'Week 11 · Game recap')
  assert.equal(feedMeta(posts[3]).kicker, 'Trade')
  assert.equal(feedMeta({ type: 'rumor' }).kicker, 'League news')
  assert.equal(feedMeta(undefined).glyph, '📰')
})
