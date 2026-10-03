import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTheme, resolveAccent, appearanceRecipe,
  readCachedRecipe, cacheRecipe, APPEARANCE_CACHE_KEY,
} from './appearance.js'

// ── resolveTheme ──────────────────────────────────────────────

test('resolveTheme prefers uiTheme', () => {
  assert.equal(resolveTheme({ uiTheme: '80s' }), '80s')
})

test('resolveTheme honours the pre-era retroMode boolean', () => {
  // Settings saved before eras existed carry only retroMode.
  assert.equal(resolveTheme({ retroMode: true }), '90s')
  assert.equal(resolveTheme({ retroMode: false }), 'default')
  assert.equal(resolveTheme({}), 'default')
})

// ── appearanceRecipe ──────────────────────────────────────────

test('the default theme touches nothing', () => {
  assert.deepEqual(appearanceRecipe({ uiTheme: 'default' }), {
    retro: false, era: null, accent: null, fontSize: null,
  })
})

test('an era theme sets data-era, and 90s sets data-retro instead', () => {
  assert.equal(appearanceRecipe({ uiTheme: '80s' }).era, '80s')
  assert.equal(appearanceRecipe({ uiTheme: '80s' }).retro, false)
  // The 90s look predates the era blocks and still rides the retro CSS.
  assert.equal(appearanceRecipe({ uiTheme: '90s' }).retro, true)
  assert.equal(appearanceRecipe({ uiTheme: '90s' }).era, null)
})

test('an era theme never carries an accent — eras own their palette', () => {
  const r = appearanceRecipe({ uiTheme: '70s', accentColor: 'teal' })
  assert.equal(r.accent, null, 'a chosen accent must not fight the era palette')
})

test('the accent is resolved to a hex, so a boot replay needs no team', () => {
  assert.equal(appearanceRecipe({ uiTheme: 'default', accentColor: 'teal' }).accent, '#00E5C7')
  // 'red' is the baseline — leave the stylesheet alone rather than pinning it.
  assert.equal(appearanceRecipe({ uiTheme: 'default', accentColor: 'red' }).accent, null)
})

test('the My Team accent resolves against the team, and falls back', () => {
  const mine = appearanceRecipe({ uiTheme: 'default', accentColor: 'team' }, 'Jared')
  assert.match(mine.accent, /^#[0-9A-Fa-f]{6}$/)
  // An unknown team must not blank the accent — it falls back to classic red.
  assert.equal(appearanceRecipe({ uiTheme: 'default', accentColor: 'team' }, 'Nobody').accent, '#E63946')
  assert.equal(resolveAccent('nonsense', 'Jared'), '#E63946')
})

test('text size only sets font-size away from 100%', () => {
  assert.equal(appearanceRecipe({ textSize: 'large' }).fontSize, '107%')
  assert.equal(appearanceRecipe({ textSize: 'small' }).fontSize, '93%')
  assert.equal(appearanceRecipe({ textSize: 'default' }).fontSize, null)
  assert.equal(appearanceRecipe({ textSize: 'bogus' }).fontSize, null)
})

test('an empty or absent settings object is the default look, not a crash', () => {
  assert.deepEqual(appearanceRecipe(), { retro: false, era: null, accent: null, fontSize: null })
})

// ── the cache ─────────────────────────────────────────────────

/** Minimal localStorage stand-in; `fail` makes every access throw. */
function stubStorage({ fail = false } = {}) {
  const map = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => { if (fail) throw new Error('denied'); return map.has(k) ? map.get(k) : null },
      setItem: (k, v) => { if (fail) throw new Error('denied'); map.set(k, String(v)) },
    },
  }
  return map
}

test('a cached recipe round-trips', () => {
  stubStorage()
  const recipe = { retro: false, era: '2150', accent: null, fontSize: '107%' }
  cacheRecipe(recipe)
  assert.deepEqual(readCachedRecipe(), recipe)
})

test('nothing cached reads as null, not as a default recipe', () => {
  stubStorage()
  assert.equal(readCachedRecipe(), null)
})

test('a corrupt cache reads as null instead of throwing', () => {
  // Boot applies this before React mounts, so a throw here is a blank app.
  const map = stubStorage()
  map.set(APPEARANCE_CACHE_KEY, '{not json')
  assert.equal(readCachedRecipe(), null)
  map.set(APPEARANCE_CACHE_KEY, '"a string"')
  assert.equal(readCachedRecipe(), null)
  map.set(APPEARANCE_CACHE_KEY, 'null')
  assert.equal(readCachedRecipe(), null)
})

test('a cache with junk fields is coerced, never passed through', () => {
  const map = stubStorage()
  map.set(APPEARANCE_CACHE_KEY, JSON.stringify({ retro: 'yes', era: 7, accent: {}, fontSize: 12 }))
  assert.deepEqual(readCachedRecipe(), { retro: true, era: null, accent: null, fontSize: null })
})

test('storage being blocked is survivable in both directions', () => {
  // Private mode and "block site data" make these accessors throw.
  stubStorage({ fail: true })
  assert.doesNotThrow(() => cacheRecipe({ retro: false, era: '80s', accent: null, fontSize: null }))
  assert.equal(readCachedRecipe(), null)
})
