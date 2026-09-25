import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePickRef, pickTransfers, trades2026, assetTypeOf } from '../data/trades2026.js'

test('parses both pick spellings and pulls out the original owner', () => {
  assert.deepEqual(parsePickRef('2027 2nd (Jason)'), {
    season: 2027, round: 2, slot: null, originalTeam: 'Jason',
  })
  assert.deepEqual(parsePickRef('2026 1.02 (A. Zurek)'), {
    season: 2026, round: 1, slot: 2, originalTeam: 'A. Zurek',
  })
  assert.deepEqual(parsePickRef('2027 1st (M. Zurek)'), {
    season: 2027, round: 1, slot: null, originalTeam: 'M. Zurek',
  })
})

test('refuses to parse anything that is not an identifiable pick', () => {
  // Player names, and picks with no original owner to resolve against.
  for (const bad of ['Bijan Robinson', "De'Von Achane", '2027 1st', '', null, undefined]) {
    assert.equal(parsePickRef(bad), null, `should not parse: ${bad}`)
  }
})

test('every pick in the trade data parses — no silent drops', () => {
  const pickNames = trades2026.flatMap((r) =>
    [...r.a.received, ...r.b.received].filter((n) => assetTypeOf(n) === 'draftPick'),
  )
  assert.ok(pickNames.length > 0)
  for (const n of pickNames) {
    assert.ok(parsePickRef(n), `pick did not parse: ${n}`)
  }
  assert.equal(pickTransfers().length, pickNames.length)
})

test('transfers run oldest-first so a re-traded pick lands on its final owner', () => {
  const ts = pickTransfers()
  const dates = ts.map((t) => t.date)
  assert.deepEqual(dates, [...dates].sort(), 'transfers must be chronological')

  // The 2026 1.02 moved A. Zurek -> Faybik -> Jared on one afternoon.
  const chain = ts.filter((t) => t.displayName === '2026 1.02 (A. Zurek)')
  assert.equal(chain.length, 2)
  assert.deepEqual(chain.map((t) => t.toTeam), ['Faybik', 'Jared'])
  assert.equal(chain[0].fromTeam, 'A. Zurek')
  assert.equal(chain[1].fromTeam, 'Faybik')
})

test('the 2027 pick swap sends each first rounder to the other team', () => {
  const ts = pickTransfers().filter((t) => t.ref.season === 2027 && t.ref.round === 1)
  assert.equal(ts.length, 2)
  const byOwner = Object.fromEntries(ts.map((t) => [t.ref.originalTeam, t.toTeam]))
  assert.deepEqual(byOwner, { 'M. Zurek': 'Dugan', Dugan: 'M. Zurek' })
})

test('a received pick always comes from the other side of that trade', () => {
  for (const t of pickTransfers()) {
    assert.notEqual(t.toTeam, t.fromTeam)
    // Match on BOTH teams: 4/2/26 has two separate trades on the same date,
    // and one of them shares a team with the other.
    const pair = [t.toTeam, t.fromTeam].sort().join('::')
    const row = trades2026.find(
      (r) => r.date === t.date && [r.a.team, r.b.team].sort().join('::') === pair,
    )
    assert.ok(row, `no trade row pairs ${t.toTeam} with ${t.fromTeam} on ${t.date}`)
    // ...and the pick must appear in the receiving side's own list.
    const side = row.a.team === t.toTeam ? row.a : row.b
    assert.ok(side.received.includes(t.displayName), `${t.displayName} not in ${t.toTeam}'s haul`)
  }
})
