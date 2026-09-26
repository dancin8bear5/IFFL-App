import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  currentArticle, archivedArticles, hasArchive, archiveBySeason, releasedFor,
  editionSlug, rankingsDeepLink,
} from './archive.js'
import { DROP_KEYS } from './rankingsRelease.js'
import { ARTICLES } from '../data/articles.js'
import { ODDS_EDITIONS } from '../data/odds/index.js'

const FIX = [
  { kind: 'rankings', id: '2026_preseason', season: 2026, title: 'Rankings 2026' },
  { kind: 'rankings', id: '2027_preseason', season: 2027, title: 'Rankings 2027' },
  { kind: 'odds', id: '2026', season: 2026, title: 'Odds 2026' },
]

test('the newest edition of a kind is the current one', () => {
  assert.equal(currentArticle(FIX, 'rankings').id, '2027_preseason')
  assert.equal(currentArticle(FIX, 'odds').id, '2026')
  assert.equal(currentArticle(FIX, 'nothing'), null)
  assert.equal(currentArticle(undefined, 'odds'), null)
})

test('the archive is everything that is not current, newest first', () => {
  const out = archivedArticles(FIX)
  assert.deepEqual(out.map((a) => a.id), ['2026_preseason'])
})

test('one edition of each kind means an empty archive', () => {
  const one = FIX.filter((a) => a.season === 2026)
  assert.deepEqual(archivedArticles(one), [])
  assert.equal(hasArchive(one), false)
  assert.equal(hasArchive(FIX), true)
  assert.equal(hasArchive([]), false)
})

test('a kind retires independently of the other', () => {
  const out = archivedArticles([
    ...FIX,
    { kind: 'odds', id: '2027', season: 2027, title: 'Odds 2027' },
  ])
  assert.deepEqual(out.map((a) => a.id).sort(), ['2026', '2026_preseason'])
})

test('archiveBySeason groups newest season first', () => {
  const many = [
    ...FIX,
    { kind: 'odds', id: '2027', season: 2027 },
    { kind: 'odds', id: '2025', season: 2025 },
    { kind: 'rankings', id: '2025_preseason', season: 2025 },
  ]
  const out = archiveBySeason(many)
  assert.deepEqual(out.map((g) => g.season), [2026, 2025])
  assert.equal(out[1].items.length, 2)
})

// ── the release gate ─────────────────────────────────────────

test('the current edition shows exactly what was released', () => {
  assert.deepEqual(releasedFor('2026_preseason', '2026_preseason', ['intro', '12-9']), ['intro', '12-9'])
  assert.deepEqual(releasedFor('2026_preseason', '2026_preseason', []), [])
})

test('a malformed release list on the current edition still fails closed', () => {
  for (const bad of [undefined, null, 'all', 42, {}, ['nonsense']]) {
    assert.deepEqual(releasedFor('2026_preseason', '2026_preseason', bad), [], String(bad))
  }
})

test('a retired edition opens completely, released or not', () => {
  assert.deepEqual(releasedFor('2025_preseason', '2026_preseason', []), DROP_KEYS)
  assert.deepEqual(releasedFor('2025_preseason', '2026_preseason', undefined), DROP_KEYS)
  assert.deepEqual(releasedFor('2025_preseason', '2026_preseason', ['intro']), DROP_KEYS)
})

test('with no current edition named, nothing is treated as retired', () => {
  // Defensive: an unknown "current" must not unlock the live edition.
  assert.deepEqual(releasedFor('2026_preseason', '', ['intro']), ['intro'])
  assert.deepEqual(releasedFor('2026_preseason', null, []), [])
})

// ── the real index ───────────────────────────────────────────

test('today the archive is empty — one edition of each kind, both current', () => {
  assert.deepEqual(archivedArticles(ARTICLES), [])
  assert.equal(currentArticle(ARTICLES, 'rankings').id, '2026_preseason')
  assert.equal(currentArticle(ARTICLES, 'odds').id, '2026')
})

test('the odds metadata in the index matches the edition modules', () => {
  for (const edition of ODDS_EDITIONS) {
    const entry = ARTICLES.find((a) => a.kind === 'odds' && a.id === String(edition.season))
    assert.ok(entry, `no article entry for the ${edition.season} odds`)
    assert.equal(entry.title, edition.title)
    assert.equal(entry.date, edition.date)
    assert.equal(entry.season, edition.season)
  }
  const odds = ARTICLES.filter((a) => a.kind === 'odds')
  assert.equal(odds.length, ODDS_EDITIONS.length, 'an odds edition is listed but has no module, or vice versa')
})

test('every article carries what the archive page needs to render a row', () => {
  for (const a of ARTICLES) {
    for (const field of ['id', 'kind', 'season', 'date', 'title', 'blurb']) {
      assert.ok(a[field], `${a.kind} ${a.id} is missing ${field}`)
    }
  }
})

// ── deep links ───────────────────────────────────────────────

test('an edition id becomes a paste-safe slug', () => {
  assert.equal(editionSlug('2026_preseason'), '2026-preseason')
  assert.equal(editionSlug(undefined), '')
})

test('a deep link with only a team still opens that team of the current edition', () => {
  assert.deepEqual(rankingsDeepLink(['wayne-vh'], FIX), { edition: null, team: 'wayne-vh' })
})

test('a deep link naming an edition is recognised with or without a team', () => {
  assert.deepEqual(rankingsDeepLink(['2026-preseason'], FIX), { edition: '2026_preseason', team: null })
  assert.deepEqual(
    rankingsDeepLink(['2026-preseason', 'wayne-vh'], FIX),
    { edition: '2026_preseason', team: 'wayne-vh' },
  )
})

test('an unknown edition segment is read as a team, not as an edition', () => {
  // Which is the old behaviour, and the only safe reading: a link to an
  // edition that no longer exists must not blank the page.
  assert.deepEqual(rankingsDeepLink(['1999-preseason'], FIX), { edition: null, team: '1999-preseason' })
})

test('an empty route names nothing', () => {
  assert.deepEqual(rankingsDeepLink([], FIX), { edition: null, team: null })
  assert.deepEqual(rankingsDeepLink(undefined, FIX), { edition: null, team: null })
})
