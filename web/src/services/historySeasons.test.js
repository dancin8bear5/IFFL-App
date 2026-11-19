import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inProgressSeason, seasonsFor } from './historySeasons.js'

const at = (y, m, d) => new Date(y, m - 1, d, 12)

test('September through December is that year\'s season', () => {
  assert.equal(inProgressSeason(at(2026, 9, 1)), 2026)
  assert.equal(inProgressSeason(at(2026, 10, 29)), 2026)
  assert.equal(inProgressSeason(at(2026, 12, 31)), 2026)
})

test('January and February belong to the previous season (playoffs, Super Bowl)', () => {
  assert.equal(inProgressSeason(at(2027, 1, 6)), 2026)
  assert.equal(inProgressSeason(at(2027, 2, 14)), 2026)
})

test('March through August has no season in progress', () => {
  for (const m of [3, 4, 5, 6, 7, 8]) assert.equal(inProgressSeason(at(2027, m, 15)), null)
})

test('Player Scores adds the season in progress, newest first', () => {
  assert.deepEqual(seasonsFor('playerScores', [2024, 2025], at(2026, 10, 29)), [2026, 2025, 2024])
})

test('other tabs stay on completed seasons only', () => {
  assert.deepEqual(seasonsFor('standings', [2024, 2025], at(2026, 10, 29)), [2025, 2024])
})

test('no duplicate once the season is in leagueHistory, and off-season adds nothing', () => {
  assert.deepEqual(seasonsFor('playerScores', [2025, 2026], at(2027, 1, 10)), [2026, 2025])
  assert.deepEqual(seasonsFor('playerScores', [2025, 2026], at(2027, 5, 1)), [2026, 2025])
})

test('junk season values are ignored rather than listed', () => {
  assert.deepEqual(seasonsFor('playerScores', ['2025', null, 'x'], at(2026, 4, 1)), [2025])
})
