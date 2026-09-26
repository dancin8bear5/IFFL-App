// historyCategories — what the six History tabs are made of.
//
// Each category declares its columns and how to turn its source documents
// into flat rows. Everything the page does — the search box, the filter
// bar, the table, the sort, the CSV export — is derived from these
// declarations by services/historyTable.js. There is no per-category UI
// code, and a seventh category is one more object in this file.
//
// Tabs are ordered alphabetically by label, which is the order the league
// asked for and also the order someone scanning a tab bar expects.
//
// `cost` marks how expensive a category is to load, and the page uses it to
// decide what to fetch and when:
//   'bundled'  ships with the app — no fetch at all
//   'lazy'     fetched once, the first time its tab is opened
//   'season'   fetched per season, because loading every year at once is
//              tens of thousands of rows (see playerScores)

import { fantasyTeams } from '../data/staticData'
import { computeAllTimeStats } from './leagueStats'

export const POSITIONS = ['QB', 'RB', 'WR', 'TE']
export const TEAM_NAMES = fantasyTeams.map((t) => t.name)

const money = (v) => (v === null || v === undefined || v === '' ? '' : `$${v}`)

/**
 * Auction draft — 2008–2025, bundled with the app.
 *
 * Finished data that will never change, and 4,066 rows gzip to 42KB in a
 * lazy chunk — less than this page's own JavaScript. Fetching it from
 * Firestore bought a round trip, a reads bill and a dependency on the
 * import having been run, for nothing.
 */
const auction = {
  key: 'auction',
  label: 'Auction',
  glyph: '💰',
  cost: 'bundled',
  blurb: 'Every auction pick since 2008 — what each player cost and who bought him.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', filter: 'select', width: 62 },
    { key: 'player', label: 'Player', type: 'text', search: true },
    { key: 'position', label: 'Pos', type: 'text', filter: 'select', width: 52 },
    { key: 'nflTeam', label: 'NFL', type: 'text', search: true, width: 52 },
    { key: 'team', label: 'Owner', type: 'text', search: true, filter: 'select' },
    { key: 'price', label: 'Price', type: 'number', filter: 'range', align: 'right', width: 66, format: money },
    { key: 'keeper', label: 'Kept', type: 'text', filter: 'select', width: 56, allLabel: 'Kept or bought' },
    { key: 'overallPick', label: 'Pick', type: 'number', align: 'right', width: 56 },
  ],
  // [season, owner, player, position, proTeam, price, overallPick, keeper]
  toRows: (rows = []) => rows.map(([season, team, player, position, nflTeam, price, overallPick, keeper]) => ({
    season, player, position, nflTeam, team,
    price: price || null,
    keeper: keeper ? 'Kept' : 'Bought',
    overallPick: overallPick || null,
  })),
}

/**
 * Games — 2008–2025, bundled for the same reason as the auction.
 *
 * One row per team per game, so every matchup appears twice, once from
 * each side. That's deliberate: filtering by team then gives you that
 * team's whole season rather than half of it.
 */
const games = {
  key: 'games',
  label: 'Games',
  glyph: '🏈',
  cost: 'bundled',
  blurb: 'Every game since 2008, from each team\'s side — scores, margins and bench points.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', filter: 'select', width: 62 },
    { key: 'week', label: 'Wk', type: 'number', filter: 'select', width: 46, allLabel: 'Any week' },
    { key: 'team', label: 'Team', type: 'text', search: true, filter: 'select' },
    { key: 'points', label: 'PF', type: 'number', filter: 'range', align: 'right', width: 62 },
    { key: 'opponent', label: 'Opponent', type: 'text', search: true, filter: 'select' },
    { key: 'oppPoints', label: 'PA', type: 'number', align: 'right', width: 62 },
    { key: 'result', label: 'Result', type: 'text', filter: 'select', width: 56, allLabel: 'Wins and losses' },
    { key: 'margin', label: 'Margin', type: 'number', filter: 'range', align: 'right', width: 70 },
    { key: 'bench', label: 'Bench', type: 'number', align: 'right', width: 62 },
  ],
  // [season, week, team, points, opponent, oppPoints, result, margin, bench]
  toRows: (rows = []) => rows.map(([season, week, team, points, opponent, oppPoints, result, margin, bench]) => ({
    season, week, team, points, opponent, oppPoints, result, margin, bench,
  })),
}

/**
 * Player scores — historyPlayerSeasons/{year} for totals, and
 * historyPlayerWeeks/{year}-{WW} for the weekly lines.
 *
 * Season-scoped on purpose. The weekly lines alone are 32,000 rows across
 * eight seasons, and there is no version of "load it all first" that ends
 * well on a phone. Picking a season is therefore part of using this tab
 * rather than a filter applied afterwards.
 */
const playerScores = {
  key: 'playerScores',
  label: 'Player Scores',
  glyph: '📈',
  cost: 'season',
  blurb: 'Season totals from 2008 and weekly lines from 2018 — ESPN kept no weekly data before then.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', width: 62 },
    { key: 'week', label: 'Wk', type: 'number', filter: 'select', width: 46, allLabel: 'Any week' },
    { key: 'player', label: 'Player', type: 'text', search: true },
    { key: 'position', label: 'Pos', type: 'text', filter: 'select', width: 52 },
    { key: 'nflTeam', label: 'NFL', type: 'text', search: true, width: 52 },
    { key: 'team', label: 'Owner', type: 'text', search: true, filter: 'select' },
    { key: 'points', label: 'Points', type: 'number', filter: 'range', align: 'right', width: 70 },
    { key: 'avg', label: 'Avg', type: 'number', filter: 'range', align: 'right', width: 62 },
    { key: 'games', label: 'GP', type: 'number', align: 'right', width: 46 },
    { key: 'posRank', label: 'Pos rk', type: 'number', filter: 'range', align: 'right', width: 62 },
    { key: 'slot', label: 'Slot', type: 'text', filter: 'select', width: 62 },
  ],
  // Season docs hold {points, avg, games, posRank, finalSlot}; weekly docs
  // hold {points, slot, status} and their own `week`. Both already carry a
  // resolved owner — the import does the TeamId lookup the raw CSV needs.
  toRows: (docs = []) => docs.flatMap((d) => (d.rows ?? []).map((p) => ({
    season: Number(d.season),
    week: d.week ?? null,
    player: p.player ?? '',
    position: p.position ?? '',
    nflTeam: p.proTeam ?? '',
    team: p.team ?? '',
    points: p.points ?? null,
    avg: p.avg ?? null,
    games: p.games ?? null,
    posRank: p.posRank ?? null,
    slot: p.slot ?? p.finalSlot ?? '',
  }))),
}

/**
 * Rookie drafts — bundled with the app, 2017–2026.
 *
 * `slot` is blank wherever the price could not name one: a $2 pick in the
 * ladder era is somewhere in 1.06–1.12, and from 2022 every first-rounder
 * cost $2. The Confidence column says which, so nobody reads a recovered
 * round as an exact slot.
 */
const rookieDrafts = {
  key: 'rookieDrafts',
  label: 'Rookie Drafts',
  glyph: '🎓',
  cost: 'bundled',
  blurb: 'Every rookie pick since the draft began in 2017 — Corey Davis at 1.01 was the first.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', filter: 'select', width: 62 },
    { key: 'slot', label: 'Slot', type: 'text', width: 56 },
    { key: 'round', label: 'Rd', type: 'number', filter: 'select', width: 44, allLabel: 'Any round' },
    { key: 'player', label: 'Player', type: 'text', search: true },
    { key: 'position', label: 'Pos', type: 'text', filter: 'select', width: 52 },
    { key: 'nflTeam', label: 'NFL', type: 'text', search: true },
    { key: 'team', label: 'Owner', type: 'text', search: true, filter: 'select' },
    { key: 'price', label: 'Price', type: 'number', align: 'right', width: 62, format: money },
    { key: 'confidence', label: 'Slot from', type: 'text', filter: 'select', allLabel: 'Any slot confidence' },
  ],
  toRows: (bySeason = {}) => Object.entries(bySeason).flatMap(([season, picks]) =>
    (picks ?? []).map((p) => ({
      season: Number(season),
      slot: p.slot ?? '',
      round: p.round ?? null,
      player: p.dropped ? '(dropped before the season)' : (p.name ?? ''),
      position: p.position ?? '',
      nflTeam: p.nflTeam ?? '',
      team: p.team ?? '',
      price: p.price ?? null,
      confidence: p.dropped ? 'dropped' : p.slot ? 'exact price' : 'round only',
    }))),
}

/**
 * Standings — leagueHistory/{year}, one row per team per season.
 * Small enough to come from context; no fetch of its own.
 */
const standings = {
  key: 'standings',
  label: 'Standings',
  glyph: '🏅',
  cost: 'bundled',
  blurb: 'Where every team finished, every season since 2008.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', filter: 'select', width: 62 },
    { key: 'place', label: 'Place', type: 'number', filter: 'range', align: 'right', width: 60 },
    { key: 'team', label: 'Team', type: 'text', search: true, filter: 'select' },
    { key: 'record', label: 'Record', type: 'text', width: 74 },
    { key: 'wins', label: 'W', type: 'number', filter: 'range', align: 'right', width: 44 },
    { key: 'losses', label: 'L', type: 'number', align: 'right', width: 44 },
    { key: 'pointsFor', label: 'PF', type: 'number', filter: 'range', align: 'right', width: 74 },
    { key: 'pointsAgainst', label: 'PA', type: 'number', align: 'right', width: 74 },
    { key: 'playoffSeed', label: 'Seed', type: 'number', align: 'right', width: 54 },
  ],
  // The all-time view is the same data asked a different way, so it's a
  // toggle on this tab rather than a seventh category. It reuses
  // leagueStats.computeAllTimeStats — the aggregation the Trophy Room
  // already runs — instead of adding a second one to keep in step.
  alt: {
    label: 'All-time',
    columns: [
      { key: 'team', label: 'Team', type: 'text', search: true, filter: 'select' },
      { key: 'seasons', label: 'Seasons', type: 'number', align: 'right', width: 72 },
      { key: 'record', label: 'Record', type: 'text', width: 90 },
      { key: 'pct', label: 'Win %', type: 'number', align: 'right', width: 66,
        format: (v) => (v == null ? '' : `${(v * 100).toFixed(1)}%`) },
      { key: 'championships', label: 'Belts', type: 'number', filter: 'range', align: 'right', width: 58 },
      { key: 'finals', label: 'Finals', type: 'number', align: 'right', width: 60 },
      { key: 'playoffs', label: 'Playoffs', type: 'number', align: 'right', width: 74 },
      { key: 'bestFinish', label: 'Best', type: 'number', align: 'right', width: 54 },
      { key: 'avgFinish', label: 'Avg finish', type: 'number', align: 'right', width: 84,
        format: (v) => (v == null ? '' : v.toFixed(1)) },
      { key: 'pointsFor', label: 'Points for', type: 'number', filter: 'range', align: 'right', width: 92,
        format: (v) => (v == null ? '' : Math.round(v).toLocaleString()) },
      { key: 'active', label: 'Status', type: 'text', filter: 'select', width: 78 },
    ],
    toRows: (seasons = []) => computeAllTimeStats(seasons).map((r) => ({
      team: r.team,
      seasons: r.seasons,
      record: `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`,
      pct: r.pct,
      championships: r.championships,
      finals: r.finals,
      playoffs: r.playoffs,
      bestFinish: r.bestFinish,
      avgFinish: r.avgFinish,
      pointsFor: r.pointsFor,
      // Departed members stay in the table — they are the league's history
      // as much as anyone still in it — but they are labelled, so a career
      // that stopped in 2019 doesn't read as a bad current team.
      active: r.active ? 'Current' : 'Former',
    })),
  },
  toRows: (seasons = []) => seasons.flatMap((s) => (s.standings ?? []).map((t) => {
    const [w, l] = String(t.record ?? '').split('-').map((n) => Number(n))
    return {
      season: Number(s.season),
      place: t.place ?? null,
      team: t.teamName ?? t.team ?? '',
      record: t.record ?? '',
      wins: Number.isFinite(w) ? w : null,
      losses: Number.isFinite(l) ? l : null,
      pointsFor: t.pointsFor ?? null,
      pointsAgainst: t.pointsAgainst ?? null,
      playoffSeed: t.playoffSeed ?? null,
    }
  })),
}

/**
 * Trades — one row per asset that moved, not one per trade.
 *
 * A trade with four players in it is four rows, which is what makes
 * "everything that ever happened to Breece Hall" a search rather than a
 * scan. The trade id ties the legs back together for display.
 */
const trades = {
  key: 'trades',
  label: 'Trades',
  glyph: '⇄',
  cost: 'bundled',
  blurb: 'Every trade on record — 2022 onward. One row per player or pick that changed hands.',
  columns: [
    { key: 'season', label: 'Season', type: 'season', filter: 'select', width: 62 },
    { key: 'date', label: 'Date', type: 'text', width: 96 },
    { key: 'asset', label: 'Asset', type: 'text', search: true },
    { key: 'assetType', label: 'Type', type: 'text', filter: 'select', width: 70 },
    { key: 'to', label: 'To', type: 'text', search: true, filter: 'select', allLabel: 'Any receiving team' },
    { key: 'from', label: 'From', type: 'text', search: true, filter: 'select', allLabel: 'Any sending team' },
  ],
  toRows: (list = []) => list.flatMap((t, i) => {
    const id = t.id ?? `${t.season}-${i}`
    const legs = []
    for (const [side, other] of [[t.a, t.b], [t.b, t.a]]) {
      for (const asset of side?.received ?? []) {
        legs.push({
          tradeId: id,
          season: Number(t.season),
          date: t.date ?? '',
          asset,
          // A pick is any asset naming a year and a round or slot.
          assetType: /\b(19|20)\d\d\b/.test(asset) && /\d\.\d|\b\d(st|nd|rd|th)\b/i.test(asset) ? 'Pick' : 'Player',
          to: side?.team ?? '',
          from: other?.team ?? '',
        })
      }
    }
    return legs
  }),
}

/** Alphabetical by label — Auction, Games, Player Scores, Rookie Drafts, Standings, Trades. */
export const CATEGORIES = [auction, games, playerScores, rookieDrafts, standings, trades]
  .sort((a, b) => a.label.localeCompare(b.label))

export const categoryByKey = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

/** URL slugs stay lowercase and hyphenated: #history/player-scores. */
export const slugOf = (c) => c.key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
export const categoryBySlug = (slug) =>
  CATEGORIES.find((c) => slugOf(c) === String(slug ?? '').toLowerCase()) ?? null
