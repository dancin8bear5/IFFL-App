import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  currentArticle, archivedArticles, hasArchive, archiveBySeason, releasedFor,
  editionSlug, rankingsDeepLink, dashboardArticle, isAged, toMs, ARCHIVE_AFTER_DAYS,
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

test('the 2026 preseason pieces: on the Dashboard in their first two weeks, in the archive after', () => {
  assert.equal(currentArticle(ARTICLES, 'rankings').id, '2026_preseason')
  assert.equal(currentArticle(ARTICLES, 'odds').id, '2026')
  // Ten days after the rankings came out: still front-page; the odds (a month older) are not.
  const early = new Date('2026-09-11T12:00:00')
  assert.equal(dashboardArticle(ARTICLES, 'rankings', early).id, '2026_preseason')
  assert.equal(dashboardArticle(ARTICLES, 'odds', early), null)
  // Week 12: both are archive material.
  const late = new Date('2026-11-25T12:00:00')
  assert.equal(dashboardArticle(ARTICLES, 'rankings', late), null)
  assert.deepEqual(archivedArticles(ARTICLES, late).map((a) => a.kind).sort(), ['odds', 'rankings'])
  assert.equal(hasArchive(ARTICLES, late), true)
})

// ── the two-week rule ────────────────────────────────────────

const D = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-25T12:00:00Z')
const dated = (kind, id, season, daysAgo) => ({ kind, id, season, publishedAt: new Date(NOW - daysAgo * D).toISOString() })

test('isAged: strictly more than two weeks, whatever shape the date arrives in', () => {
  assert.equal(ARCHIVE_AFTER_DAYS, 14)
  assert.equal(isAged(new Date(NOW - 13 * D), NOW), false)
  assert.equal(isAged(new Date(NOW - 14 * D), NOW), false, 'exactly 14 days is still current')
  assert.equal(isAged(new Date(NOW - 14 * D - 1), NOW), true)
  assert.equal(isAged({ toMillis: () => NOW - 30 * D }, NOW), true)  // Firestore Timestamp
  assert.equal(isAged(NOW - 30 * D, NOW), true)
  assert.equal(isAged('2026-09-01', NOW), true)
})

test('isAged: a date that cannot be read is NOT aged — a typo must not pull the newest piece', () => {
  for (const bad of [null, undefined, '', 'September 2026?', NaN, {}]) assert.equal(isAged(bad, NOW), false)
  assert.equal(toMs('nonsense'), null)
})

test('a fresh edition is on the Dashboard; the same edition two weeks on is in the archive', () => {
  const fresh = [dated('rankings', 'r27', 2027, 3), dated('odds', 'o27', 2027, 20)]
  assert.equal(dashboardArticle(fresh, 'rankings', NOW).id, 'r27')
  assert.equal(dashboardArticle(fresh, 'odds', NOW), null)
  assert.deepEqual(archivedArticles(fresh, NOW).map((a) => a.id), ['o27'])
})

test('replaced AND aged both land in the archive, and nothing is listed twice', () => {
  const list = [dated('rankings', 'r26', 2026, 400), dated('rankings', 'r27', 2027, 40), dated('odds', 'o27', 2027, 2)]
  assert.deepEqual(archivedArticles(list, NOW).map((a) => a.id), ['r27', 'r26'])
  assert.equal(archiveBySeason(list, NOW).length, 2)
})

test('the rule is not per kind: a kind nobody has built yet follows it too', () => {
  const list = [dated('trueRecord', 'tr-w11', 2026, 1), dated('trueRecord', 'tr-w8', 2026, 22)]
  assert.equal(dashboardArticle(list, 'trueRecord', NOW).id, 'tr-w11')
  assert.deepEqual(archivedArticles(list, NOW).map((a) => a.id), ['tr-w8'])
})

test('AGE DOES NOT UNLOCK: an aged current edition keeps its release gate', () => {
  // In the archive by age, but still the current edition → only what was released.
  assert.equal(dashboardArticle(ARTICLES, 'rankings', NOW), null)
  assert.deepEqual(releasedFor('2026_preseason', '2026_preseason', ['intro']), ['intro'])
  assert.deepEqual(releasedFor('2026_preseason', '2026_preseason', 'garbage'), [])
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
    // Without a readable date an article never ages out and sits on the Dashboard forever.
    assert.notEqual(toMs(a.publishedAt), null, `${a.kind} ${a.id} needs a readable publishedAt`)
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
