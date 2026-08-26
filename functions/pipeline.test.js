// pipeline.test.js — end-to-end tests of the real trade pipeline over an
// in-memory Firestore. See harness/fakeFirestore.js for why.
//
// Each PATH below is a distinct way a trade can reach the app, and each has
// at least two independent tests: the happy case, and the case that would
// silently corrupt data if the guard failed.

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadPipeline } = require('./harness/loadPipeline')

// ── Fixtures ──────────────────────────────────────────────────
// A minimal but realistic league: two teams, two players, config present.
const baseSeed = () => ({
  config: {
    league: {
      activeSeasonYear: 2026,
      userTeamMap: { uidJared: 'Jared', uidJason: 'Jason' },
    },
    groupme: { userMap: { Jared: '111', Jason: '222' } },
  },
  users: {
    uidJared: { fcmToken: 'tok-jared' },
    uidJason: { fcmToken: 'tok-jason' },
  },
  players: {
    p_dak: { name: 'Dak Prescott', teamName: 'Jared', isActive: true, tradeHistory: [] },
    p_turpin: { name: 'KaVontae Turpin', teamName: 'Jason', isActive: true, tradeHistory: [] },
  },
  draftPicks: {
    pick_jason_2027_2: {
      season: 2027, round: 2, originalTeamName: 'Jason',
      currentTeamName: 'Jason', status: 'available', tradeHistory: [],
    },
  },
  trades: {},
  tradeIngests: {},
  groupmeTradeSignals: {},
})

/**
 * A GroupMe signal naming the same two teams with no picks. Required for
 * auto-apply: tradeReconcile Rule 4 holds any ESPN trade with no chat
 * corroboration, so this is the ONLY shape that reaches "applied".
 */
const corroboratingSignal = (overrides = {}) => ({
  capturedAt: Date.now() - 60 * 60 * 1000,
  teams: ['Jared', 'Jason'],
  hasPick: false,
  picks: [],
  directionPhrases: [],
  ...overrides,
})

const swapMoves = [
  { player: 'Dak Prescott', fromTeam: 'Jared', toTeam: 'Jason' },
  { player: 'KaVontae Turpin', fromTeam: 'Jason', toTeam: 'Jared' },
]

/* ═══════════════ PATH A — ESPN clean auto-apply ═══════════════ */

test('A1 — a clean two-player ESPN trade applies end to end', async () => {
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOk = corroboratingSignal()
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({
    sourceId: 'gmail-msg-1',
    tradeDate: '2026-08-26T18:00:00Z',
    moves: swapMoves,
    sourceLabel: 'espn-gmail',
  })

  assert.equal(res.status, 'applied', JSON.stringify(res))

  // Rosters actually moved.
  assert.equal(db.get('players', 'p_dak').teamName, 'Jason')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jared')

  // Provenance written on both players.
  assert.deepEqual(db.get('players', 'p_dak').tradeHistory, ['via Jared (ESPN)'])
  assert.deepEqual(db.get('players', 'p_turpin').tradeHistory, ['via Jason (ESPN)'])

  // One completed trade doc, correctly seasoned so the web listener sees it.
  const trades = db.dump('trades')
  assert.equal(trades.length, 1)
  assert.equal(trades[0].status, 'completed')
  assert.equal(trades[0].season, 2026)
  assert.equal(trades[0].source, 'espn-gmail')

  // Both sides recorded, and they cross over correctly.
  const sides = [trades[0].assetsFromProposer, trades[0].assetsFromReceiver]
    .map((s) => s.map((a) => a.displayName).sort())
  assert.deepEqual(sides.map((s) => s.length), [1, 1])
  assert.deepEqual(sides.flat().sort(), ['Dak Prescott', 'KaVontae Turpin'])

  // Ledger row per asset.
  assert.equal(db.dump('transactions').length, 2)

  // Ingest marked applied and linked to the trade.
  const ingest = db.get('tradeIngests', 'gmail-msg-1')
  assert.equal(ingest.status, 'applied')
  assert.equal(ingest.tradeId, trades[0].id)
})

test('A2 — the same source event twice is a no-op, not a double trade', async () => {
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOk = corroboratingSignal()
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.processEspnTrade({ sourceId: 'gmail-msg-1', moves: swapMoves })
  const afterFirst = db.get('players', 'p_dak').teamName

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-1', moves: swapMoves })

  assert.equal(res.status, 'duplicate')
  assert.equal(res.previousStatus, 'applied')
  assert.equal(db.dump('trades').length, 1, 'a redelivery must not create a second trade')
  assert.equal(db.dump('transactions').length, 2, 'nor duplicate ledger rows')
  assert.equal(db.get('players', 'p_dak').teamName, afterFirst)
})

/* ═══════════════ PATH B — ESPN cannot resolve a name ═══════════════ */

test('B1 — a name not on the roster holds the whole trade, moves nothing', async () => {
  const { db, pipeline } = loadPipeline(baseSeed())

  const res = await pipeline.processEspnTrade({
    sourceId: 'gmail-msg-typo',
    moves: [
      { player: 'Dak Prescot', fromTeam: 'Jared', toTeam: 'Jason' }, // typo
      { player: 'KaVontae Turpin', fromTeam: 'Jason', toTeam: 'Jared' },
    ],
  })

  assert.equal(res.status, 'needs_review')
  // The leg that DID resolve must not have been applied on its own.
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jason', 'partial application would split a trade')
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
  assert.equal(db.dump('trades').length, 0)
  assert.equal(db.dump('transactions').length, 0)
  assert.equal(db.get('tradeIngests', 'gmail-msg-typo').status, 'needs_review')
})

test('B2 — an ambiguous duplicate name is flagged, never guessed', async () => {
  const seed = baseSeed()
  seed.players.p_dak2 = { name: 'Dak Prescott', teamName: 'Jared', isActive: true, tradeHistory: [] }
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-dupe', moves: swapMoves })

  assert.equal(res.status, 'needs_review')
  assert.match(res.problems[0].reason, /ambiguous/)
  assert.equal(db.dump('trades').length, 0)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
  assert.equal(db.get('players', 'p_dak2').teamName, 'Jared')
})

/* ═══════════════ PATH C — reconcile hold (the pick trap) ═══════════════ */

test('C1 — a pick seen in GroupMe holds the trade instead of dropping it', async () => {
  // This is the 2026-08-16 failure: ESPN auto-applied Dak/Turpin and the
  // 2027 2nd silently vanished because ESPN emails never carry picks.
  const seed = baseSeed()
  seed.groupmeTradeSignals.sig1 = {
    capturedAt: Date.now() - 60 * 60 * 1000, // an hour ago, inside the 48h window
    teams: ['Jared', 'Jason'],
    hasPick: true,
    picks: [{ year: 2027, round: 2, raw: '2027 2nd' }],
    directionPhrases: [],
  }
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-pick', moves: swapMoves })

  assert.equal(res.status, 'needs_review', 'a pick must never auto-apply')
  assert.match(res.reasons.join(' '), /pick/i)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared', 'players must not move while the pick is unresolved')
  assert.equal(db.dump('trades').length, 0)

  const ingest = db.get('tradeIngests', 'gmail-msg-pick')
  assert.equal(ingest.status, 'needs_review')
  assert.equal(ingest.groupmeSignalId, 'sig1', 'the review item must point back at the signal')
  assert.equal(ingest.groupmePicks.length, 1)
})

test('C2 — a stale signal is not corroboration, so the trade is still held', async () => {
  // A 4-day-old signal falls outside the 48h window, so no signal is found
  // at all — which lands on Rule 4 rather than the pick rule.
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOld = corroboratingSignal({
    capturedAt: Date.now() - 96 * 60 * 60 * 1000,
    hasPick: true,
    picks: [{ year: 2027, round: 2, raw: '2027 2nd' }],
  })
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-stale', moves: swapMoves })

  assert.equal(res.status, 'needs_review')
  assert.match(res.reasons.join(' '), /no human corroboration/i)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
})

test('C3 — an ESPN trade with NO GroupMe chatter is held, never auto-applied', async () => {
  // tradeReconcile Rule 4. This is the DEFAULT outcome for a quiet trade,
  // and the single most important operational fact about this pipeline:
  // silence in the group chat means a human has to confirm the trade.
  const { db, pipeline } = loadPipeline(baseSeed())

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-quiet', moves: swapMoves })

  assert.equal(res.status, 'needs_review')
  assert.match(res.reasons.join(' '), /no human corroboration/i)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared', 'nothing moves without corroboration')
  assert.equal(db.dump('trades').length, 0)
  // It is still RECORDED — seen, ingested, logged, awaiting review.
  assert.equal(db.get('tradeIngests', 'gmail-msg-quiet').status, 'needs_review')
  assert.deepEqual(db.get('tradeIngests', 'gmail-msg-quiet').moves, swapMoves)
})

test('C4 — a team mismatch between the two sources holds the trade', async () => {
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigWrong = corroboratingSignal({ teams: ['Jared', 'Bill'] })
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-mismatch', moves: swapMoves })

  assert.equal(res.status, 'needs_review')
  assert.match(res.reasons.join(' '), /mismatch/i)
  assert.equal(db.dump('trades').length, 0)
})

/* ═══════════════ PATH D — in-app accept → execute → completed ═══════════════ */

const proposedTrade = () => ({
  proposingTeamName: 'Jared',
  receivingTeamName: 'Jason',
  assetsFromProposer: [{ assetType: 'player', assetId: 'p_dak', displayName: 'Dak Prescott' }],
  assetsFromReceiver: [{ assetType: 'player', assetId: 'p_turpin', displayName: 'KaVontae Turpin' }],
  season: 2026,
  status: 'accepted',
})

test('D1 — accepting executes the transfer and completes the trade', async () => {
  const seed = baseSeed()
  seed.trades.t1 = proposedTrade()
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.executeTradeAssets('t1')

  assert.equal(db.get('players', 'p_dak').teamName, 'Jason')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jared')
  assert.equal(db.get('trades', 't1').status, 'completed')
  assert.ok(db.get('trades', 't1').completedAt)
  assert.equal(db.dump('transactions').length, 2)
  assert.deepEqual(db.get('players', 'p_dak').tradeHistory, ['via Jared'])
})

test('D2 — a redelivered accept does not execute the trade twice', async () => {
  // Cloud Functions deliver at least once; the guard re-reads status.
  const seed = baseSeed()
  seed.trades.t1 = proposedTrade()
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.executeTradeAssets('t1')
  await pipeline.executeTradeAssets('t1')

  assert.equal(db.get('players', 'p_dak').teamName, 'Jason', 'a second run must not bounce him back')
  assert.equal(db.dump('transactions').length, 2, 'nor double the ledger')
})

test('D3 — a draft pick moves by currentTeamName, not teamName', async () => {
  const seed = baseSeed()
  seed.trades.t1 = {
    ...proposedTrade(),
    assetsFromReceiver: [{ assetType: 'draftPick', assetId: 'pick_jason_2027_2', displayName: '2027 Round 2' }],
  }
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.executeTradeAssets('t1')

  const pick = db.get('draftPicks', 'pick_jason_2027_2')
  assert.equal(pick.currentTeamName, 'Jared')
  assert.equal(pick.originalTeamName, 'Jason', 'origin must survive the trade')
  assert.deepEqual(pick.tradeHistory, ['via Jason'])
})

/* ═══════════════ PATH E — onTradeWrite notifications ═══════════════ */

const evt = (before, after, tradeId = 't1') => ({
  params: { tradeId },
  data: {
    before: { exists: !!before, data: () => before },
    after: { exists: !!after, data: () => after },
  },
})

test('E1 — a new offer notifies the receiver, not the proposer', async () => {
  const { pipeline, sent } = loadPipeline(baseSeed())

  await pipeline.handleTradeWrite(evt(null, { ...proposedTrade(), status: 'proposed' }))

  assert.equal(sent.push.length, 1)
  assert.equal(sent.push[0].token, 'tok-jason', 'the receiver is the one who has to act')
  assert.match(sent.push[0].notification.title, /Trade Offer/)
})

test('E2 — a write that does not change status notifies nobody', async () => {
  // This is what keeps note edits and BOOM/DOOM votes from spamming the league.
  const { pipeline, sent } = loadPipeline(baseSeed())
  const before = { ...proposedTrade(), status: 'proposed' }

  await pipeline.handleTradeWrite(evt(before, { ...before, notes: 'edited afterwards' }))

  assert.equal(sent.push.length, 0)
  assert.equal(sent.groupme.length, 0)
})

test('E3 — a declined trade notifies the proposer', async () => {
  const { pipeline, sent } = loadPipeline(baseSeed())
  const before = { ...proposedTrade(), status: 'proposed' }

  await pipeline.handleTradeWrite(evt(before, { ...before, status: 'rejected' }))

  assert.equal(sent.push[0].token, 'tok-jared')
  assert.match(sent.push[0].notification.title, /Declined/)
})

test('E4 — a deleted trade is ignored rather than throwing', async () => {
  const { pipeline, sent } = loadPipeline(baseSeed())
  const res = await pipeline.handleTradeWrite(evt({ ...proposedTrade() }, null))
  assert.equal(res, null)
  assert.equal(sent.push.length, 0)
})

/* ═══════════════ PATH F — ordering between the two pollers ═══════════════ */
// tradeReconcile Rule 4 holds any ESPN trade with no corroborating GroupMe
// signal, and the signal only exists after pollGroupMeTrades has captured it.
// So the two pollers' relative cadence decides whether a trade the league DID
// announce in chat auto-applies or gets held. These pin that behavior.

test('F1 — a signal that lands after the ESPN scan does not rescue the trade', async () => {
  const seed = baseSeed()
  const { db, pipeline } = loadPipeline(seed)

  // ESPN poller runs first: no signal exists yet.
  const first = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })
  assert.equal(first.status, 'needs_review')

  // GroupMe poller catches up a minute later and writes the corroboration.
  db.collection('groupmeTradeSignals').doc('late').set(corroboratingSignal())

  // The ingest is deduped by sourceId, so the late signal changes nothing.
  const second = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })
  assert.equal(second.status, 'duplicate')
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared', 'still held — a human must resolve it')
})

test('F2 — the same trade auto-applies when the signal is already there', async () => {
  // Identical inputs to F1 apart from ordering: this is the whole reason
  // pollGroupMeTrades must run more often than pollEspnGmail.
  const seed = baseSeed()
  seed.groupmeTradeSignals.early = corroboratingSignal()
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })

  assert.equal(res.status, 'applied')
  assert.equal(db.get('players', 'p_dak').teamName, 'Jason')
})
