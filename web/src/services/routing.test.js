import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHash, slugForTab, tabForSlug, allSlugs, SLUG_ALIASES } from './routing.js'

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
