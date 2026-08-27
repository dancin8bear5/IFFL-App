import test from 'node:test'
import assert from 'node:assert/strict'
import { computeLegacyRankings, CHAMPIONSHIP_POINTS } from './legacyRankings.js'

// Two seasons, hand-computable. Records are "W-L".
const history = [
  {
    season: 2025,
    champion: 'Jared',
    runnerUp: 'Bill',
    standings: [
      { teamName: 'Jared', place: 1, record: '11-3' },
      { teamName: 'Bill', place: 2, record: '10-4' },
      { teamName: 'Faybik', place: 3, record: '12-2' },
    ],
  },
  {
    season: 2024,
    champion: 'Bill',
    runnerUp: 'Faybik',
    standings: [
      { teamName: 'Jared', place: 4, record: '7-7' },
      { teamName: 'Bill', place: 1, record: '9-5' },
      { teamName: 'Faybik', place: 2, record: '11-3' },
    ],
  },
]

const by = (rows, team) => rows.find((r) => r.teamName === team)

test('score is (career wins + weighted championships) divided by seasons played', () => {
  const rows = computeLegacyRankings(history)
  const jared = by(rows, 'Jared')
  assert.equal(jared.wins, 18) // 11 + 7
  assert.equal(jared.championships, 1)
  assert.equal(jared.seasons, 2)
  assert.equal(jared.careerPoints, 18 + CHAMPIONSHIP_POINTS)
  assert.equal(jared.score, (18 + CHAMPIONSHIP_POINTS) / 2)
  assert.equal(jared.winPoints, 9)
  assert.equal(jared.beltPoints, CHAMPIONSHIP_POINTS / 2)
})

test('the divisor covers both terms, not just the championship term', () => {
  // The precedence trap: wins + (belts x N)/seasons would leave winPoints
  // undivided. Every row's components must be per-season.
  for (const r of computeLegacyRankings(history)) {
    assert.equal(r.winPoints, r.wins / r.seasons)
    assert.equal(r.beltPoints, (r.championships * CHAMPIONSHIP_POINTS) / r.seasons)
    assert.equal(r.score, r.careerPoints / r.seasons)
  }
})

test('identical careers rank by tenure — the shorter one rates higher', () => {
  const sameCareer = [
    { season: 2025, champion: null, standings: [{ teamName: 'Bill', place: 1, record: '10-4' }] },
    { season: 2024, champion: null, standings: [{ teamName: 'Bill', place: 1, record: '10-4' }] },
    { season: 2023, champion: null, standings: [
      { teamName: 'Jared', place: 1, record: '10-4' },
      { teamName: 'Bill', place: 2, record: '0-14' },
    ] },
  ]
  const rows = computeLegacyRankings(sameCareer)
  assert.equal(by(rows, 'Bill').wins, 20)
  assert.equal(by(rows, 'Bill').seasons, 3)
  assert.equal(by(rows, 'Jared').wins, 10)
  assert.equal(by(rows, 'Jared').seasons, 1)
  // Jared 10.0 a season, Bill 6.67 — fewer, better years win.
  assert.equal(by(rows, 'Jared').rank, 1)
})

test('a belt from a standings-less shell season still counts as a season played', () => {
  // 2008 sits in Firestore as a shell: champion known, standings empty.
  // Counting the belt but not the year would inflate that team's rate.
  const withShell = [
    { season: 2008, champion: 'Jared', runnerUp: 'Bill', standings: [] },
    { season: 2009, champion: null, standings: [
      { teamName: 'Jared', place: 1, record: '10-4' },
      { teamName: 'Bill', place: 2, record: '8-6' },
    ] },
  ]
  const rows = computeLegacyRankings(withShell)
  const jared = by(rows, 'Jared')
  assert.equal(jared.championships, 1)
  assert.equal(jared.seasons, 2) // 1 if the shell were ignored
  assert.equal(jared.score, (10 + CHAMPIONSHIP_POINTS) / 2)
  assert.equal(by(rows, 'Bill').seasons, 2) // counted via runnerUp
})

test('no row ever scores Infinity or NaN, even on an all-shell history', () => {
  const shellsOnly = [
    { season: 2008, champion: 'Jared', runnerUp: 'Bill', standings: [] },
    { season: 2007, champion: 'Bill', standings: [] },
  ]
  for (const r of computeLegacyRankings(shellsOnly)) {
    assert.ok(Number.isFinite(r.score), `${r.teamName} scored ${r.score}`)
    assert.ok(r.seasons >= 1)
  }
})

test('the two components always sum to the score', () => {
  for (const r of computeLegacyRankings(history)) {
    assert.equal(r.winPoints + r.beltPoints, r.score)
  }
})

test('championships outweigh a modest win edge', () => {
  // Faybik has 23 wins to Bill's 19, but Bill has a belt and Faybik doesn't.
  const rows = computeLegacyRankings(history)
  assert.equal(by(rows, 'Faybik').wins, 23)
  assert.equal(by(rows, 'Bill').wins, 19)
  assert.equal(by(rows, 'Bill').championships, 1)
  assert.equal(by(rows, 'Bill').score, (19 + CHAMPIONSHIP_POINTS) / 2)
  assert.equal(by(rows, 'Faybik').score, 23 / 2)
  assert.ok(by(rows, 'Bill').rank < by(rows, 'Faybik').rank)
})

test('a big enough win rate still beats a one-belt team over the same tenure', () => {
  // Both play 2 seasons. Bill wins 5 a year and a belt; Faybik just wins.
  // Faybik's edge is derived from the weight (belt + 4 points of daylight)
  // rather than hardcoded — at a fixed number this fixture lands on an exact
  // tie the moment CHAMPIONSHIP_POINTS is retuned to that gap, and the
  // tie-break hands it to the belt. The property is "enough wins beat a
  // belt", not "30 wins beat a belt".
  const perSeason = 5 + Math.ceil((CHAMPIONSHIP_POINTS + 4) / 2)
  const lopsided = [2025, 2024].map((season, i) => ({
    season,
    champion: i === 0 ? 'Bill' : null,
    standings: [
      { teamName: 'Bill', place: 2, record: '5-9' },
      { teamName: 'Faybik', place: 1, record: `${perSeason}-0` },
    ],
  }))
  const rows = computeLegacyRankings(lopsided)
  assert.equal(by(rows, 'Bill').score, (10 + CHAMPIONSHIP_POINTS) / 2)
  assert.equal(by(rows, 'Faybik').score, perSeason)
  assert.ok(by(rows, 'Faybik').score > by(rows, 'Bill').score)
  assert.equal(by(rows, 'Faybik').rank, 1)
})

test('ranks are dense and ordered by score, best first', () => {
  const rows = computeLegacyRankings(history)
  assert.deepEqual(rows.map((r) => r.rank), rows.map((_, i) => i + 1))
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].score >= rows[i].score)
  }
})

test('an equal score breaks toward more championships', () => {
  // Belted has 1 belt + 5 wins; Grinder has 0 belts + (5 + CHAMPIONSHIP_POINTS)
  // wins. Same score by construction, whatever the constant is set to.
  const tied = [
    {
      season: 2025,
      champion: 'Bill',
      standings: [
        { teamName: 'Bill', place: 1, record: '5-9' },
        { teamName: 'Faybik', place: 2, record: `${5 + CHAMPIONSHIP_POINTS}-0` },
      ],
    },
  ]
  const rows = computeLegacyRankings(tied)
  assert.equal(by(rows, 'Bill').score, by(rows, 'Faybik').score)
  assert.equal(by(rows, 'Bill').rank, 1)
})

test('departed managers are excluded — the board ranks current franchises', () => {
  const withGhost = [
    {
      season: 2013,
      champion: 'Sherman',
      standings: [
        { teamName: 'Sherman', place: 1, record: '12-2' },
        { teamName: 'Jared', place: 2, record: '9-5' },
      ],
    },
  ]
  const rows = computeLegacyRankings(withGhost)
  assert.equal(by(rows, 'Sherman'), undefined)
  assert.ok(by(rows, 'Jared'))
})

test('empty and missing history yield no rows rather than throwing', () => {
  assert.deepEqual(computeLegacyRankings([]), [])
  assert.deepEqual(computeLegacyRankings(null), [])
  assert.deepEqual(computeLegacyRankings(undefined), [])
})

test('the weight is a parameter, so the board re-sorts if the league retunes it', () => {
  // At 1 point per belt, wins dominate and Faybik's 23 lead the board.
  const rows = computeLegacyRankings(history, 1)
  assert.equal(by(rows, 'Faybik').rank, 1)
  assert.equal(by(rows, 'Faybik').score, 23 / 2)
})
