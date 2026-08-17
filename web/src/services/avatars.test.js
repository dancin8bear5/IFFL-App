import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_PRESETS, TEAM_PRESET_IDS, UNIVERSAL_PRESET_IDS,
  presetsForTeam, resolveAvatar, initialsFor, dataUrlBytes,
} from './avatars.js'

const TEAM = { logo: '/logos/jared.jpg', color: '#0891B2' }

test('every referenced preset id actually exists in the registry', () => {
  const referenced = [...Object.values(TEAM_PRESET_IDS).flat(), ...UNIVERSAL_PRESET_IDS]
  for (const id of referenced) {
    assert.ok(AVATAR_PRESETS[id], `preset '${id}' is referenced but not defined`)
  }
})

test('all twelve teams get a flavored set', () => {
  const teams = ['A. Zurek', 'Abad', 'Bill', 'Cantone', 'Dugan', 'Faybik',
    'Foley', 'Jared', 'Jason', 'M. Zurek', 'Ryan', 'Wayne']
  for (const t of teams) {
    assert.ok((TEAM_PRESET_IDS[t] ?? []).length > 0, `${t} has no themed presets`)
  }
})

test('presetsForTeam puts the team-flavored picks first, then universals', () => {
  const list = presetsForTeam('Jared')
  assert.equal(list[0].id, 'moon')
  assert.equal(list[1].id, 'rocket')
  assert.ok(list.some((p) => p.id === 'football'), 'universals still offered')
  assert.ok(list.length > UNIVERSAL_PRESET_IDS.length)
})

test('presetsForTeam never repeats an id', () => {
  for (const team of Object.keys(TEAM_PRESET_IDS)) {
    const ids = presetsForTeam(team).map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, `${team} has a duplicate preset`)
  }
})

test('an unknown team still gets the universal set rather than nothing', () => {
  const list = presetsForTeam('Some Former Member')
  assert.equal(list.length, UNIVERSAL_PRESET_IDS.length)
})

test('presets carry the fields the UI renders', () => {
  for (const p of presetsForTeam('Bill')) {
    assert.ok(p.emoji, `${p.id} missing emoji`)
    assert.ok(p.bg, `${p.id} missing bg`)
    assert.ok(p.label, `${p.id} missing label`)
  }
})

// ── resolveAvatar priority ──

test('an upload beats everything else', () => {
  const r = resolveAvatar('Jared', { dataUrl: 'data:image/jpeg;base64,AAA', presetId: 'moon' }, TEAM)
  assert.deepEqual(r, { kind: 'image', src: 'data:image/jpeg;base64,AAA' })
})

test('a preset beats the shipped team logo', () => {
  const r = resolveAvatar('Jared', { presetId: 'moon' }, TEAM)
  assert.equal(r.kind, 'preset')
  assert.equal(r.emoji, '🌙')
})

test('with no avatar doc, the shipped team logo is used', () => {
  assert.deepEqual(resolveAvatar('Jared', null, TEAM), { kind: 'image', src: '/logos/jared.jpg' })
  assert.deepEqual(resolveAvatar('Jared', undefined, TEAM), { kind: 'image', src: '/logos/jared.jpg' })
})

test('no doc and no logo falls back to colored initials', () => {
  const r = resolveAvatar('Eric Alt', null, null)
  assert.equal(r.kind, 'initials')
  assert.equal(r.text, 'EA')
})

test('an unknown presetId falls through instead of rendering a blank', () => {
  // A preset retired from the registry must not leave the avatar empty.
  const r = resolveAvatar('Jared', { presetId: 'no-such-preset' }, TEAM)
  assert.deepEqual(r, { kind: 'image', src: '/logos/jared.jpg' })
})

test('an empty dataUrl is ignored rather than rendering a broken image', () => {
  const r = resolveAvatar('Jared', { dataUrl: '' }, TEAM)
  assert.equal(r.src, '/logos/jared.jpg')
})

// ── initials ──

test('initialsFor strips the dot in abbreviated names', () => {
  assert.equal(initialsFor('M. Zurek'), 'MZ')
  assert.equal(initialsFor('A. Zurek'), 'AZ')
})

test('initialsFor caps at two characters', () => {
  assert.equal(initialsFor('Wayne Vonder Heide'), 'WV')
})

test('initialsFor handles a single word and empty input', () => {
  assert.equal(initialsFor('Bill'), 'B')
  assert.equal(initialsFor(''), '')
  assert.equal(initialsFor(null), '')
})

// ── size guard ──

test('dataUrlBytes measures decoded size, accounting for padding', () => {
  // "AAAA" base64 -> 3 bytes, no padding
  assert.equal(dataUrlBytes('data:image/jpeg;base64,AAAA'), 3)
  // one '=' -> 2 bytes
  assert.equal(dataUrlBytes('data:image/jpeg;base64,AAA='), 2)
  // two '=' -> 1 byte
  assert.equal(dataUrlBytes('data:image/jpeg;base64,AA=='), 1)
})

test('dataUrlBytes returns 0 for a malformed value rather than throwing', () => {
  assert.equal(dataUrlBytes('not-a-data-url'), 0)
})
