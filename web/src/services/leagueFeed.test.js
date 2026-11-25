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

test('splitFeed: only the latest week\'s matchup write-ups stay in the rail', () => {
  const now = Date.parse('2026-11-25T12:00:00Z'), D = 864e5
  const at = (d) => ({ toMillis: () => now - d * D })
  const out = splitFeed([
    { id: 'g12', type: 'game', season: 2026, week: 12, title: 'a', body: 'x', publishedAt: at(0) },
    { id: 'w12', type: 'week', season: 2026, week: 12, title: 'b', body: 'x', publishedAt: at(0) },
    { id: 'g11', type: 'game', season: 2026, week: 11, title: 'c', body: 'x', publishedAt: at(7) },
    { id: 'w11', type: 'week', season: 2026, week: 11, title: 'd', body: 'x', publishedAt: at(7) },
    { id: 'backfill-w3', type: 'game', season: 2026, week: 3, title: 'e', body: 'x', publishedAt: at(0) },
    { id: 'trade', type: 'trade', season: 2026, week: null, title: 'f', body: 'x', publishedAt: at(9) },
    { id: 'notice', type: 'milestone', season: 2026, week: null, title: 'g', body: 'x', publishedAt: at(2) },
  ], now)
  assert.deepEqual(out.recent.map((p) => p.id).sort(), ['g12', 'notice', 'trade', 'w12'])
  assert.deepEqual(out.past.map((p) => p.id).sort(), ['backfill-w3', 'g11', 'w11'])
})

test('splitFeed: a new season\'s week 1 retires last season\'s week 17', () => {
  const out = splitFeed([
    { id: 'old', type: 'game', season: 2026, week: 17, title: 'a', body: 'x' },
    { id: 'new', type: 'game', season: 2027, week: 1, title: 'b', body: 'x' },
  ])
  assert.deepEqual(out.recent.map((p) => p.id), ['new'])
})
