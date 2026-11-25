import test from 'node:test'
import assert from 'node:assert/strict'
import { feedMeta, sortFeed, visibleFeed, splitFeed } from './leagueFeed.js'

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

test('splitFeed: two weeks on the Dashboard, then the archive — hidden posts in neither', () => {
  const now = Date.parse('2026-11-25T12:00:00Z'), D = 864e5
  const at = (d) => ({ toMillis: () => now - d * D })
  const out = splitFeed([
    { id: 'new', type: 'trade', body: 'x', publishedAt: at(1) },
    { id: 'edge', type: 'trade', body: 'x', publishedAt: at(14) },
    { id: 'old', type: 'week', week: 9, season: 2026, body: 'x', publishedAt: at(15) },
    { id: 'pulled', type: 'game', body: 'x', hidden: true, publishedAt: at(30) },
    { id: 'just-written', type: 'game', body: 'x' }, // timestamp not landed yet
  ], now)
  assert.deepEqual(out.recent.map((p) => p.id).sort(), ['edge', 'just-written', 'new'])
  assert.deepEqual(out.past.map((p) => p.id), ['old'])
})
