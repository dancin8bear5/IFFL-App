import test from 'node:test'
import assert from 'node:assert/strict'
import { keeperPicks, keeperLeaderboard, bestKeeperPick, worstKeeperPick, keeperValue } from './keeperValue.js'

// [season, team, player, position, nflTeam, price, overallPick, keeper]
const AUCTION_ROWS = [
  [2013, 'M. Zurek', 'Trent Richardson', 'RB', 'Cle', 34, 5, 1], // keeper, 144.9 pts -> 4.26.. pts/$
  [2013, 'M. Zurek', 'Dropped Flyer', 'WR', 'NYJ', 1, 200, 1], // keeper with no matching player-season
  [2013, 'Bill', 'Big Bought Player', 'RB', 'Dal', 50, 2, 0], // bought, must be excluded
  [2013, 'Bill', 'Keeper Bill', 'WR', 'GB', 2, 150, 1], // keeper, 200 pts -> 100 pts/$
  [2014, 'M. Zurek', 'Another Keeper', 'TE', 'KC', 10, 80, 1], // keeper, 50 pts -> 5 pts/$
]

const PLAYER_SEASONS = [
  {
    season: 2013,
    rows: [
      { player: 'Trent Richardson', points: 144.9 },
      { player: 'Keeper Bill', points: 200 },
      { player: 'Big Bought Player', points: 999 }, // present but not a keeper — must not leak in
    ],
  },
  {
    season: 2014,
    rows: [{ player: 'Another Keeper', points: 50 }],
  },
]

test('keeperPicks only returns points-per-dollar for kept rows, excluding bought picks', () => {
  const picks = keeperPicks(AUCTION_ROWS, PLAYER_SEASONS)
  assert.equal(picks.some((p) => p.player === 'Big Bought Player'), false)
  const trent = picks.find((p) => p.player === 'Trent Richardson')
  assert.equal(trent.price, 34)
  assert.equal(trent.points, 144.9)
  assert.ok(Math.abs(trent.ptsPerDollar - 144.9 / 34) < 1e-9)
})

test('keeperPicks skips a keeper with no matching player-season instead of throwing', () => {
  assert.doesNotThrow(() => keeperPicks(AUCTION_ROWS, PLAYER_SEASONS))
  const picks = keeperPicks(AUCTION_ROWS, PLAYER_SEASONS)
  assert.equal(picks.some((p) => p.player === 'Dropped Flyer'), false)
  assert.equal(picks.length, 3)
})

test('keeperLeaderboard sums spend and points per team and sorts descending by pts/$', () => {
  const picks = keeperPicks(AUCTION_ROWS, PLAYER_SEASONS)
  const board = keeperLeaderboard(picks)
  const zurek = board.find((t) => t.team === 'M. Zurek')
  const bill = board.find((t) => t.team === 'Bill')
  // M. Zurek: 34 + 10 spend, 144.9 + 50 points (Dropped Flyer excluded)
  assert.equal(zurek.spend, 44)
  assert.equal(zurek.points, 194.9)
  assert.ok(Math.abs(zurek.ptsPerDollar - 194.9 / 44) < 1e-9)
  // Bill: 2 spend, 200 points (the bought pick never enters this sum)
  assert.equal(bill.spend, 2)
  assert.equal(bill.points, 200)
  assert.equal(bill.ptsPerDollar, 100)
  assert.deepEqual(board.map((t) => t.team), ['Bill', 'M. Zurek'])
})

test('bestKeeperPick and worstKeeperPick pick out the extremes', () => {
  const picks = keeperPicks(AUCTION_ROWS, PLAYER_SEASONS)
  assert.equal(bestKeeperPick(picks).player, 'Keeper Bill')
  assert.equal(worstKeeperPick(picks).player, 'Trent Richardson')
})

test('bestKeeperPick/worstKeeperPick return null on an empty list', () => {
  assert.equal(bestKeeperPick([]), null)
  assert.equal(worstKeeperPick([]), null)
})

test('an includeTeam filter drops a team entirely from the leaderboard', () => {
  const includeTeam = (team) => team !== 'Bill'
  const result = keeperValue(AUCTION_ROWS, PLAYER_SEASONS, includeTeam)
  assert.equal(result.leaderboard.some((t) => t.team === 'Bill'), false)
  assert.equal(result.leaderboard.find((t) => t.team === 'M. Zurek')?.spend, 44)
  assert.equal(result.bestPick.player, 'Another Keeper')
})

test('a rookie-draft pick is not a keeper in his rookie season — but is one the year after', () => {
  // ESPN flags 2020+ rookie picks exactly like keepers. Without the rookie
  // classes, a $1 rookie becomes the best "keeper" in league history.
  const rows = [
    [2020, 'Jared', 'Justin Jefferson', 'WR', 'Min', 1, 180, 1], // rookie pick, flagged as keeper
    [2020, 'Jared', 'Real Keeper', 'RB', 'Dal', 20, 10, 1],
    [2021, 'Jared', 'Justin Jefferson', 'WR', 'Min', 6, 12, 1], // now genuinely kept
  ]
  const seasons = [
    { season: 2020, rows: [{ player: 'Justin Jefferson', points: 288.2 }, { player: 'Real Keeper', points: 100 }] },
    { season: 2021, rows: [{ player: 'Justin Jefferson', points: 330 }] },
  ]
  const rookieClasses = { 2020: [{ name: 'justin jefferson ' }, { name: null }] }

  assert.equal(bestKeeperPick(keeperPicks(rows, seasons)).price, 1, 'the bug, when no classes are passed')
  const picks = keeperPicks(rows, seasons, () => true, rookieClasses)
  assert.deepEqual(picks.map((p) => [p.season, p.player]), [[2020, 'Real Keeper'], [2021, 'Justin Jefferson']])
  assert.equal(keeperValue(rows, seasons, () => true, rookieClasses).bestPick.season, 2021)
})
