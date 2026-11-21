import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultTabSlug, DEFAULT_TAB_CHOICES } from './defaultTab.js'

test('a saved slug is used as-is', () => {
  assert.equal(defaultTabSlug({ defaultTabSlug: 'players' }), 'players')
  assert.equal(defaultTabSlug({ defaultTabSlug: 'trades' }), 'trades')
})

test('an old number is read by the label it was saved under', () => {
  // The old picker: 0 Dashboard · 1 Rosters · 2 Market · 3 League.
  assert.equal(defaultTabSlug({ defaultTab: 0 }), 'dashboard')
  assert.equal(defaultTabSlug({ defaultTab: 1 }), 'rosters')
  // The bug: index 2 had come to mean Players. "Market" is the trades tab.
  assert.equal(defaultTabSlug({ defaultTab: 2 }), 'trades')
  // "League" was retired into the Dashboard — not Trades, where index 3 pointed.
  assert.equal(defaultTabSlug({ defaultTab: 3 }), 'dashboard')
})

test('a saved slug outranks a leftover number in the same doc', () => {
  // Settings merge on save, so the old field can sit beside the new one.
  assert.equal(defaultTabSlug({ defaultTab: 2, defaultTabSlug: 'rosters' }), 'rosters')
})

test('anything unreadable opens the Dashboard', () => {
  assert.equal(defaultTabSlug({}), 'dashboard')
  assert.equal(defaultTabSlug(null), 'dashboard')
  assert.equal(defaultTabSlug({ defaultTab: 9 }), 'dashboard')
  assert.equal(defaultTabSlug({ defaultTab: '2' }), 'dashboard')
  assert.equal(defaultTabSlug({ defaultTabSlug: 'admin' }), 'dashboard')
})

test('every choice is unique', () => {
  const slugs = DEFAULT_TAB_CHOICES.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})

test('every choice is a real tab in TabLayout', async () => {
  // TABS lives in a .jsx file node cannot import, so read the registry as
  // text. This is the check that would have caught the original bug: a
  // picker offering a tab the app no longer has.
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../views/TabLayout.jsx', import.meta.url), 'utf8')
  for (const { slug } of DEFAULT_TAB_CHOICES) {
    assert.ok(src.includes(`slug: '${slug}'`), `TabLayout has no tab with slug '${slug}'`)
  }
})
