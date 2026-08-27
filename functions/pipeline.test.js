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

test('C1 — a pick in GroupMe no longer holds the trade, but is not lost', async () => {
  // The 2026-08-16 failure was the pick vanishing, not the players moving.
  // Players apply; the pick becomes its own review item pointing at the
  // trade that just landed, so it can be attached rather than dropped.
  const seed = baseSeed()
  seed.groupmeTradeSignals.sig1 = corroboratingSignal({
    hasPick: true,
    picks: [{ year: 2027, round: 2, raw: '2027 2nd' }],
  })
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-pick', moves: swapMoves })

  assert.equal(res.status, 'applied')
  assert.equal(res.pickToDo, true)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jason', 'players must not be held hostage')

  const todo = db.get('tradeIngests', 'gmail-msg-pick__picks')
  assert.ok(todo, 'the pick must leave a to-do behind')
  assert.equal(todo.status, 'needs_review')
  assert.equal(todo.kind, 'unattached_pick')
  assert.equal(todo.attachToTradeId, db.dump('trades')[0].id, 'must point at the trade it belongs to')
  assert.equal(todo.groupmePicks.length, 1)
})

test('C2 — a stale signal is ignored, and the trade applies unimpeded', async () => {
  // A 4-day-old signal is outside the 48h window, so no signal is found —
  // which is now simply not a reason to stop.
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOld = corroboratingSignal({
    capturedAt: Date.now() - 96 * 60 * 60 * 1000,
    hasPick: true,
    picks: [{ year: 2027, round: 2, raw: '2027 2nd' }],
  })
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-stale', moves: swapMoves })

  assert.equal(res.status, 'applied')
  assert.equal(db.get('players', 'p_dak').teamName, 'Jason')
  assert.ok(!db.get('tradeIngests', 'gmail-msg-stale__picks'), 'a stale pick mention is not this trade')
})

test('C3 — an ESPN trade with NO GroupMe chatter now applies on its own', async () => {
  // The email IS the confirmation. Silence in the group chat is not evidence
  // of anything, and holding every quiet trade meant hand-entering them.
  const { db, pipeline } = loadPipeline(baseSeed())

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-msg-quiet', moves: swapMoves })

  assert.equal(res.status, 'applied')
  assert.equal(db.get('players', 'p_dak').teamName, 'Jason')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jared')
  assert.equal(db.dump('trades').length, 1)
  assert.equal(db.get('tradeIngests', 'gmail-msg-quiet').status, 'applied')
  assert.ok(!db.get('tradeIngests', 'gmail-msg-quiet__picks'), 'no pick mentioned, no to-do')
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

test('F1 — a pick signal that lands after the ESPN scan is missed entirely', async () => {
  // Auto-apply changed what this race costs. It no longer decides whether a
  // trade applies — it decides whether the PICK riding along with it is
  // noticed. Get here and the players are right, the pick is silently gone,
  // and nothing in the app says so. This is why pollGroupMeTrades must run
  // more often than pollEspnGmail.
  const { db, pipeline } = loadPipeline(baseSeed())

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })
  assert.equal(res.status, 'applied')

  // GroupMe catches up a minute later, mentioning the pick.
  db.collection('groupmeTradeSignals').doc('late').set(
    corroboratingSignal({ hasPick: true, picks: [{ year: 2027, round: 2, raw: '2027 2nd' }] }),
  )

  // Too late — the ingest is deduped, so the pick never becomes a to-do.
  const again = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })
  assert.equal(again.status, 'duplicate')
  assert.ok(!db.get('tradeIngests', 'gmail-race__picks'), 'the pick is lost — the cost of losing the race')
})

test('F2 — the same trade catches the pick when the signal is already there', async () => {
  // Identical inputs to F1 apart from ordering.
  const seed = baseSeed()
  seed.groupmeTradeSignals.early = corroboratingSignal({
    hasPick: true,
    picks: [{ year: 2027, round: 2, raw: '2027 2nd' }],
  })
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.processEspnTrade({ sourceId: 'gmail-race', moves: swapMoves })

  assert.equal(res.status, 'applied')
  assert.equal(res.pickToDo, true)
  assert.ok(db.get('tradeIngests', 'gmail-race__picks'), 'the pick is caught and queued')
})

/* ═══════════════ PATH G — commissioner cancels a pending offer ═══════════════ */

test('G1 — cancelling tells both teams and moves nothing', async () => {
  const { db, pipeline, sent } = loadPipeline(baseSeed())
  const before = { ...proposedTrade(), status: 'proposed' }

  await pipeline.handleTradeWrite(
    evt(before, { ...before, status: 'cancelled', cancelReason: 'stale offer' }),
  )

  // Both sides notified — a cancelled trade otherwise just vanishes.
  assert.equal(sent.push.length, 2)
  assert.deepEqual(sent.push.map((p) => p.token).sort(), ['tok-jared', 'tok-jason'])
  for (const p of sent.push) assert.match(p.notification.title, /Cancelled/)
  assert.match(sent.push[0].notification.body, /stale offer/)

  // And nothing executed.
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jason')
  assert.equal(db.dump('transactions').length, 0)
})

test('G2 — a cancelled trade can never execute, even if re-delivered', async () => {
  // The guard in executeTradeAssets is status-based, so this is the property
  // that matters: cancelled is not accepted, so the assets stay put.
  const seed = baseSeed()
  seed.trades.t1 = { ...proposedTrade(), status: 'cancelled' }
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.executeTradeAssets('t1')

  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
  assert.equal(db.get('trades', 't1').status, 'cancelled', 'must not be flipped to completed')
  assert.equal(db.dump('transactions').length, 0)
})

test('G3 — cancelling with no reason still notifies cleanly', async () => {
  const { pipeline, sent } = loadPipeline(baseSeed())
  const before = { ...proposedTrade(), status: 'proposed' }

  await pipeline.handleTradeWrite(evt(before, { ...before, status: 'cancelled', cancelReason: null }))

  assert.equal(sent.push.length, 2)
  for (const p of sent.push) assert.ok(!/undefined|null/.test(p.notification.body), p.notification.body)
})

/* ═══════════════ PATH H — GroupMe delivery modes ═══════════════ */
// During rollout only the commissioner should hear anything, so the mode
// has to be enforced where the DM is actually sent — not at each call site.

const dmBodies = (sent) => sent.groupme.map((g) => JSON.parse(g.body).direct_message)

test('H1 — commissioner mode redirects another team\'s DM to the commissioner', async () => {
  const seed = baseSeed()
  seed.config.groupme = { mode: 'commissioner', userMap: { Jared: '111', Jason: '222' } }
  const { pipeline, sent } = loadPipeline(seed)

  // A new offer would normally DM the receiver, Jason.
  await pipeline.handleTradeWrite(evt(null, { ...proposedTrade(), status: 'proposed' }))

  const dms = dmBodies(sent)
  assert.equal(dms.length, 1)
  assert.equal(dms[0].recipient_id, '111', 'must land on Jared, not Jason')
  assert.match(dms[0].text, /would have gone to Jason/)
  assert.ok(!dms.some((d) => d.recipient_id === '222'), 'Jason must receive nothing')
})

test('H2 — a DM already addressed to the commissioner is not tagged', async () => {
  const seed = baseSeed()
  seed.config.groupme = { mode: 'commissioner', userMap: { Jared: '111', Jason: '222' } }
  const { pipeline, sent } = loadPipeline(seed)

  // Declining Jared's offer DMs Jared — he is the intended recipient.
  const before = { ...proposedTrade(), status: 'proposed' }
  await pipeline.handleTradeWrite(evt(before, { ...before, status: 'rejected' }))

  const dms = dmBodies(sent)
  assert.equal(dms[0].recipient_id, '111')
  assert.ok(!/would have gone to/.test(dms[0].text), 'no redirect tag on his own message')
})

test('H3 — paused still sends nothing at all', async () => {
  const seed = baseSeed()
  seed.config.groupme = { mode: 'paused', userMap: { Jared: '111', Jason: '222' } }
  const { pipeline, sent } = loadPipeline(seed)

  await pipeline.handleTradeWrite(evt(null, { ...proposedTrade(), status: 'proposed' }))
  assert.equal(sent.groupme.length, 0)
})

test('H4 — the legacy paused boolean still means paused', async () => {
  // An un-migrated config must not start blasting the league.
  const seed = baseSeed()
  seed.config.groupme = { paused: true, userMap: { Jared: '111', Jason: '222' } }
  const { pipeline, sent } = loadPipeline(seed)

  await pipeline.handleTradeWrite(evt(null, { ...proposedTrade(), status: 'proposed' }))
  assert.equal(sent.groupme.length, 0)
})

test('H5 — all mode delivers to the team the message names', async () => {
  const seed = baseSeed()
  seed.config.groupme = { mode: 'all', userMap: { Jared: '111', Jason: '222' } }
  const { pipeline, sent } = loadPipeline(seed)

  await pipeline.handleTradeWrite(evt(null, { ...proposedTrade(), status: 'proposed' }))

  const dms = dmBodies(sent)
  assert.equal(dms[0].recipient_id, '222', 'the receiver gets his own offer')
  assert.ok(!/would have gone to/.test(dms[0].text))
})

/* ═══════════════ PATH I — ESPN voids a trade ═══════════════ */
// ESPN can undo a trade after the fact. Anything this app applied from an
// ESPN email has to be undoable the same way.

const completedTrade = () => ({
  proposingTeamName: 'Jared',
  receivingTeamName: 'Jason',
  assetsFromProposer: [{ assetType: 'player', assetId: 'p_dak', displayName: 'Dak Prescott' }],
  assetsFromReceiver: [{ assetType: 'player', assetId: 'p_turpin', displayName: 'KaVontae Turpin' }],
  season: 2026,
  status: 'completed',
})

test('I1 — reversing sends every asset back to the side that sent it', async () => {
  const seed = baseSeed()
  seed.players.p_dak.teamName = 'Jason'      // already traded
  seed.players.p_turpin.teamName = 'Jared'
  seed.trades.t1 = completedTrade()
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.reverseTradeAssets('t1', 'voided in ESPN')

  assert.equal(res.ok, true)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared', 'back to who sent him')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jason')
  assert.equal(db.get('trades', 't1').status, 'reversed')
  assert.equal(db.get('trades', 't1').reverseReason, 'voided in ESPN')
  assert.equal(db.dump('transactions').length, 2, 'the undo is on the ledger too')
})

test('I2 — a second reversal is refused, not applied twice', async () => {
  const seed = baseSeed()
  seed.players.p_dak.teamName = 'Jason'
  seed.players.p_turpin.teamName = 'Jared'
  seed.trades.t1 = completedTrade()
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.reverseTradeAssets('t1', 'voided')
  const second = await pipeline.reverseTradeAssets('t1', 'voided')

  assert.equal(second.ok, false)
  assert.match(second.error, /reversed/)
  assert.equal(db.get('players', 'p_dak').teamName, 'Jared', 'must not bounce back again')
  assert.equal(db.dump('transactions').length, 2)
})

test('I3 — reversal also returns draft picks, by currentTeamName', async () => {
  const seed = baseSeed()
  seed.draftPicks.pick_jason_2027_2.currentTeamName = 'Jared' // was traded away
  seed.trades.t1 = {
    ...completedTrade(),
    assetsFromReceiver: [{ assetType: 'draftPick', assetId: 'pick_jason_2027_2', displayName: '2027 Round 2' }],
  }
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.reverseTradeAssets('t1', 'voided')

  assert.equal(db.get('draftPicks', 'pick_jason_2027_2').currentTeamName, 'Jason')
})

test('I4 — a historical entry with no live asset id reverses without throwing', async () => {
  // Keeper-sheet backfills carry assetId: null by design.
  const seed = baseSeed()
  seed.trades.t1 = {
    ...completedTrade(),
    assetsFromProposer: [{ assetType: 'player', assetId: null, displayName: 'Someone' }],
    assetsFromReceiver: [],
  }
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.reverseTradeAssets('t1', 'voided')
  assert.equal(res.ok, true)
  assert.equal(db.get('trades', 't1').status, 'reversed')
})

test('I5 — a reversal notifies both teams', async () => {
  const { pipeline, sent } = loadPipeline(baseSeed())
  const before = completedTrade()

  await pipeline.handleTradeWrite(
    evt(before, { ...before, status: 'reversed', reverseReason: 'voided in ESPN' }),
  )

  assert.equal(sent.push.length, 2)
  assert.deepEqual(sent.push.map((p) => p.token).sort(), ['tok-jared', 'tok-jason'])
  for (const p of sent.push) assert.match(p.notification.title, /Reversed/)
  assert.equal(sent.groupme.length, 2)
})

test('I6 — a reverse requested from the web app executes server-side', async () => {
  // The web app can only flip status; members have no write access to
  // players. This is the path a commissioner actually uses.
  const seed = baseSeed()
  seed.players.p_dak.teamName = 'Jason'
  seed.players.p_turpin.teamName = 'Jared'
  seed.trades.t1 = { ...completedTrade(), status: 'reverseRequested', reverseReason: 'ESPN voided it' }
  const { db, pipeline } = loadPipeline(seed)

  await pipeline.handleTradeWrite(
    evt({ ...completedTrade() }, db.get('trades', 't1'), 't1'),
  )

  assert.equal(db.get('players', 'p_dak').teamName, 'Jared')
  assert.equal(db.get('players', 'p_turpin').teamName, 'Jason')
  assert.equal(db.get('trades', 't1').status, 'reversed')
})

test('I7 — a proposed trade cannot be reversed', async () => {
  const seed = baseSeed()
  seed.trades.t1 = { ...completedTrade(), status: 'proposed' }
  const { db, pipeline } = loadPipeline(seed)

  const res = await pipeline.reverseTradeAssets('t1', 'nope')
  assert.equal(res.ok, false)
  assert.equal(db.get('trades', 't1').status, 'proposed')
  assert.equal(db.dump('transactions').length, 0)
})

test('A3 — a trade is dated when it happened, not when the poller ran', async () => {
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOk = corroboratingSignal()
  const { db, pipeline } = loadPipeline(seed)

  const emailArrived = new Date('2026-08-26T09:35:00Z')
  await pipeline.processEspnTrade({
    sourceId: 'gmail-dated', tradeDate: emailArrived, moves: swapMoves,
  })

  const t = db.dump('trades')[0]
  assert.equal(t.date.toMillis(), emailArrived.getTime(), 'ledger must sort by the real time')
})

test('A4 — an unusable date falls back to now rather than inventing one', async () => {
  const seed = baseSeed()
  seed.groupmeTradeSignals.sigOk = corroboratingSignal()
  const { db, pipeline } = loadPipeline(seed)

  const before = Date.now()
  await pipeline.processEspnTrade({ sourceId: 'gmail-baddate', tradeDate: 'not a date', moves: swapMoves })

  const t = db.dump('trades')[0]
  assert.ok(t.date.toMillis() >= before, 'must be a real timestamp, not NaN')
})
