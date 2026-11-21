import test from 'node:test'
import assert from 'node:assert/strict'
import { levels, validate } from './runner.mjs'
import { tuesdayGraph, classifyScrapeFailure, scrapeRetry, parseScrapeWeek, SCRAPE_FIX } from './tuesday.mjs'

test('the graph is valid, and its shape is the one in the header', () => {
  const g = tuesdayGraph()
  assert.ok(validate(g))
  assert.deepEqual(levels(g), [['preflight'], ['scrape'], ['trades', 'scores-check', 'feed-check'], ['commit'], ['digest']])
})

test('only preflight and scrape can fail the run — the scores are safe after that', () => {
  const required = tuesdayGraph().filter((n) => !n.optional).map((n) => n.id)
  assert.deepEqual(required, ['preflight', 'scrape', 'digest'])
})

test('scrape failures are told apart by what the scraper printed', () => {
  assert.equal(classifyScrapeFailure('x\nError: ESPN session looks logged out — run: ...'), 'loggedOut')
  assert.equal(classifyScrapeFailure('week 11 not final: Jared starter X shows "8:15 PM"'), 'notFinal')
  assert.equal(classifyScrapeFailure('Error: refusing week(s) 12: last finished week is 11'), 'notFinal')
  assert.equal(classifyScrapeFailure('TimeoutError: page.goto'), 'stall')
  assert.equal(classifyScrapeFailure(''), 'stall')
  // Only the END of the output counts: an old "logged out" far up the log is history.
  assert.equal(classifyScrapeFailure(`logged out\n${'ok\n'.repeat(40)}TimeoutError`), 'stall')
  for (const k of ['loggedOut', 'notFinal', 'stall']) assert.ok(SCRAPE_FIX[k])
})

test('retry policy: logged-out stops; not-final waits 3h three times; a stall gets one more go', () => {
  const kind = (k) => Object.assign(new Error(k), { kind: k })
  assert.equal(scrapeRetry()(kind('loggedOut')), null)
  const nf = scrapeRetry()
  assert.deepEqual([1, 2, 3, 4].map(() => nf(kind('notFinal'))), [10800000, 10800000, 10800000, null])
  const st = scrapeRetry()
  assert.deepEqual([st(kind('stall')), st(kind('stall'))], [600000, null])
  // A stall after two waits still gets its own retry — the counts are separate.
  const mix = scrapeRetry()
  mix(kind('notFinal')); mix(kind('notFinal'))
  assert.equal(mix(kind('stall')), 600000)
})

test('parseScrapeWeek reads the season and week(s) from the scraper log line', () => {
  assert.deepEqual(parseScrapeWeek('2026-11-17T16:00:03 season 2026 week(s) 10\n...'), { season: 2026, weeks: [10] })
  assert.deepEqual(parseScrapeWeek('season 2026 week(s) 1,2,3 (dry run)'), { season: 2026, weeks: [1, 2, 3] })
  assert.deepEqual(parseScrapeWeek('nothing useful'), { season: null, weeks: [] })
})
