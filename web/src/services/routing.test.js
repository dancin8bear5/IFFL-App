import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeHash, slugForTab, tabForSlug, allSlugs, SLUG_ALIASES,
  parseRoute, teamSlug, teamFromSlug, rosterHash,
} from './routing.js'

// Mirrors the real TABS shape closely enough to exercise the mapping.
const TABS = [
  { label: 'Dashboard', slug: 'dashboard' },
  { label: 'Rosters', slug: 'rosters' },
  { label: 'Players', slug: 'players' },
  { label: 'Trades', slug: 'trades' },
  { label: 'myTeam Worksheet', slug: 'worksheet' },
  { label: 'The POD', slug: 'pod' },
  { label: 'Big Board', slug: 'board' },
]

// ── normalizeHash ──────────────────────────────────────────────

test('strips the leading hash', () => {
  assert.equal(normalizeHash('#rosters'), 'rosters')
})

test('tolerates the #/slug form some browsers and links produce', () => {
  assert.equal(normalizeHash('#/rosters'), 'rosters')
  assert.equal(normalizeHash('#//rosters'), 'rosters')
})

test('accepts a bare slug with no hash at all', () => {
  assert.equal(normalizeHash('rosters'), 'rosters')
})

test('is case-insensitive — links get capitalised by chat apps', () => {
  assert.equal(normalizeHash('#Rosters'), 'rosters')
  assert.equal(normalizeHash('#BOARD'), 'board')
})

test('drops anything after the slug', () => {
  assert.equal(normalizeHash('#rosters/jared'), 'rosters')
  assert.equal(normalizeHash('#rosters?team=bill'), 'rosters')
})

test('empty, missing and null hashes all come back empty', () => {
  assert.equal(normalizeHash(''), '')
  assert.equal(normalizeHash('#'), '')
  assert.equal(normalizeHash(null), '')
  assert.equal(normalizeHash(undefined), '')
})

// ── aliases ────────────────────────────────────────────────────

test('the old F.M.K. Market names still resolve to Trades', () => {
  // Links shared before F.M.K. was hidden must not break.
  assert.equal(normalizeHash('#market'), 'trades')
  assert.equal(normalizeHash('#fmk'), 'trades')
})

test('every alias points at a slug that actually exists', () => {
  const slugs = new Set(allSlugs(TABS))
  for (const [alias, target] of Object.entries(SLUG_ALIASES)) {
    assert.ok(slugs.has(target), `alias "${alias}" targets missing slug "${target}"`)
  }
})

// ── tabForSlug ─────────────────────────────────────────────────

test('resolves each slug to its own tab', () => {
  assert.equal(tabForSlug(TABS, 'dashboard'), 0)
  assert.equal(tabForSlug(TABS, '#rosters'), 1)
  assert.equal(tabForSlug(TABS, '#board'), 6)
})

test('an unknown slug is -1, not a silent fallback to the Dashboard', () => {
  // A typo'd link should be a visible miss the caller decides about.
  assert.equal(tabForSlug(TABS, '#rostrs'), -1)
  assert.equal(tabForSlug(TABS, ''), -1)
  assert.equal(tabForSlug(TABS, null), -1)
})

test('an alias resolves to the aliased tab', () => {
  assert.equal(tabForSlug(TABS, '#market'), 3)
})

// ── slugForTab ─────────────────────────────────────────────────

test('maps an index back to its slug', () => {
  assert.equal(slugForTab(TABS, 3), 'trades')
})

test('an out-of-range index is empty, not a crash', () => {
  assert.equal(slugForTab(TABS, 99), '')
  assert.equal(slugForTab(TABS, -1), '')
  assert.equal(slugForTab(undefined, 0), '')
})

test('a tab with no slug is simply not linkable', () => {
  assert.equal(slugForTab([{ label: 'Hidden' }], 0), '')
})

// ── round trip ─────────────────────────────────────────────────

test('every tab round-trips index → slug → index', () => {
  TABS.forEach((t, i) => {
    assert.equal(tabForSlug(TABS, slugForTab(TABS, i)), i, `tab ${i} (${t.label})`)
  })
})

test('slugs are unique — two tabs sharing one would make a link ambiguous', () => {
  const slugs = allSlugs(TABS)
  assert.equal(new Set(slugs).size, slugs.length)
})

// ── team roster routes ─────────────────────────────────────────

const TEAMS = [
  { name: 'A. Zurek' }, { name: 'M. Zurek' }, { name: 'Abad' },
  { name: 'Bill' }, { name: "Ja'Marr" },
]

test('parseRoute splits the tab from its parameter', () => {
  assert.deepEqual(parseRoute('#rosters/a-zurek'), { slug: 'rosters', param: 'a-zurek' })
  assert.deepEqual(parseRoute('#rosters'), { slug: 'rosters', param: '' })
})

test('parseRoute survives the forms links arrive in', () => {
  assert.deepEqual(parseRoute('#/rosters/bill'), { slug: 'rosters', param: 'bill' })
  assert.deepEqual(parseRoute('#ROSTERS/BILL'), { slug: 'rosters', param: 'bill' })
  assert.deepEqual(parseRoute('#rosters/bill?x=1'), { slug: 'rosters', param: 'bill' })
})

test('a tab slug still parses when the hash carries no parameter', () => {
  assert.equal(parseRoute('#board').slug, 'board')
  assert.equal(parseRoute('#board').param, '')
})

test('normalizeHash keeps working now that it delegates to parseRoute', () => {
  assert.equal(normalizeHash('#rosters/bill'), 'rosters')
  assert.equal(normalizeHash('#market'), 'trades')
  assert.equal(normalizeHash(''), '')
})

test('teamSlug makes a readable, punctuation-free segment', () => {
  assert.equal(teamSlug('A. Zurek'), 'a-zurek')
  assert.equal(teamSlug('M. Zurek'), 'm-zurek')
  assert.equal(teamSlug("Ja'Marr"), 'ja-marr')
  assert.equal(teamSlug('Bill'), 'bill')
})

test('the two Zureks do not collide', () => {
  // Same surname, different teams — the one case where a sloppy slug
  // would silently open the wrong roster.
  assert.notEqual(teamSlug('A. Zurek'), teamSlug('M. Zurek'))
})

test('teamFromSlug round-trips every real team', () => {
  for (const t of TEAMS) {
    assert.equal(teamFromSlug(teamSlug(t.name), TEAMS), t.name)
  }
})

test('an unknown team slug resolves to empty, not a wrong team', () => {
  assert.equal(teamFromSlug('nobody', TEAMS), '')
  assert.equal(teamFromSlug('', TEAMS), '')
  assert.equal(teamFromSlug('bill', []), '')
})

test('rosterHash builds the shareable link', () => {
  assert.equal(rosterHash('A. Zurek'), '#rosters/a-zurek')
  assert.equal(rosterHash(''), '#rosters')
  assert.equal(rosterHash(null), '#rosters')
})

test('a rosterHash parses back to the team it names', () => {
  const name = 'M. Zurek'
  assert.equal(teamFromSlug(parseRoute(rosterHash(name)).param, TEAMS), name)
})
