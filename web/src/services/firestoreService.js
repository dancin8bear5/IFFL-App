// firestoreService — direct port of Services/FirestoreDataService.swift.
// Same collections, same queries, same batch semantics. Listener functions
// return an unsubscribe fn (the JS analogue of ListenerRegistration.remove()).
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteField,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { WAIVER_KEEPER_VALUE as WAIVER_VALUE, WAIVER_CLEARS_REQUIRED as WAIVER_CLEARS } from '../data/staticData'

// Collection names — mirrors `enum Col`
const COL = {
  players: 'players',
  draftPicks: 'draftPicks',
  trades: 'trades',
  interests: 'playerInterests',
  messages: 'messages',
  config: 'config',
  fmk: 'playerFMK',
  userSettings: 'userSettings',
  leagueHistory: 'leagueHistory',
  transactions: 'transactions',
}

const snapToDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const tsToDate = (v) => (v instanceof Timestamp ? v.toDate() : v ? new Date(v) : null)

// ── League Config — config/league ─────────────────────────────

export async function fetchLeagueConfig() {
  const snap = await getDoc(doc(db, COL.config, 'league'))
  return snap.exists() ? snap.data() : null
}

export function addAuthorizedUID(uid) {
  return updateDoc(doc(db, COL.config, 'league'), { authorizedUIDs: arrayUnion(uid) })
}

export function removeAuthorizedUID(uid) {
  return updateDoc(doc(db, COL.config, 'league'), { authorizedUIDs: arrayRemove(uid) })
}

export function updateActiveSeasonYear(year) {
  return updateDoc(doc(db, COL.config, 'league'), { activeSeasonYear: year })
}

export function assignTeam(uid, teamName) {
  return updateDoc(doc(db, COL.config, 'league'), { [`userTeamMap.${uid}`]: teamName })
}

export function removeTeamAssignment(uid) {
  return updateDoc(doc(db, COL.config, 'league'), { [`userTeamMap.${uid}`]: deleteField() })
}

export function setOffSeason(value) {
  return updateDoc(doc(db, COL.config, 'league'), { isOffSeason: value })
}

/** Replace the whole email→team auto-link map (keys are literal emails). */
export function saveTeamEmailMap(map) {
  return updateDoc(doc(db, COL.config, 'league'), { teamEmailMap: map })
}

// ── Players ───────────────────────────────────────────────────

/** Commissioner kill-switches: area keys hidden from the whole league. */
export function setDisabledAreas(areaKeys) {
  return updateDoc(doc(db, COL.config, 'league'), { disabledAreas: areaKeys })
}

export function listenToPlayers(callback) {
  const q = query(collection(db, COL.players), where('isActive', '==', true))
  return onSnapshot(q, (snap) => callback(snapToDocs(snap)))
}

export function addPlayer(player) {
  return addDoc(collection(db, COL.players), player)
}

export function updatePlayer(playerId, player) {
  return setDoc(doc(db, COL.players, playerId), player)
}

export function transferPlayer(playerId, toTeam, tradeNote) {
  return updateDoc(doc(db, COL.players, playerId), {
    teamName: toTeam,
    tradeHistory: arrayUnion(tradeNote),
  })
}

export function deactivatePlayer(playerId) {
  return updateDoc(doc(db, COL.players, playerId), { isActive: false })
}

/** Batch-write repaired price maps: [{id, prices, name?, teamName?}] from contracts.repairedPrices. */
export function repairPlayerPrices(repairs, meta = {}) {
  const batch = writeBatch(db)
  for (const r of repairs) {
    batch.update(doc(db, COL.players, r.id), { prices: r.prices })
    batch.set(doc(collection(db, COL.transactions)), {
      type: 'adjust',
      season: meta.season ?? null,
      teamName: r.teamName ?? null,
      playerId: r.id,
      playerName: r.name ?? null,
      note: 'Price map repaired to formula',
      actorUid: meta.actorUid ?? null,
      createdAt: Timestamp.now(),
    })
  }
  return batch.commit()
}

// ── Draft Picks ───────────────────────────────────────────────

export function listenToDraftPicks(callback) {
  const q = query(collection(db, COL.draftPicks), where('status', '==', 'available'))
  return onSnapshot(q, (snap) => callback(snapToDocs(snap)))
}

export function addDraftPick(pick) {
  return addDoc(collection(db, COL.draftPicks), pick)
}

export function transferDraftPick(pickId, toTeam, tradeNote) {
  return updateDoc(doc(db, COL.draftPicks, pickId), {
    currentTeamName: toTeam,
    tradeHistory: arrayUnion(tradeNote),
  })
}

/** Atomic: mark pick used + create the drafted player. Mirrors convertPickToPlayer. */
export async function convertPickToPlayer(pickId, player) {
  const batch = writeBatch(db)
  batch.update(doc(db, COL.draftPicks, pickId), {
    status: 'used',
    playerName: player.name,
    nflTeam: player.nflTeam ?? null,
  })
  batch.set(doc(collection(db, COL.players)), player)
  return batch.commit()
}

// ── Trades ────────────────────────────────────────────────────

export function listenToTrades(season, callback) {
  const q = query(
    collection(db, COL.trades),
    where('season', '==', season),
    orderBy('date', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snapToDocs(snap).map((t) => ({ ...t, date: tsToDate(t.date) }))),
  )
}

export function proposeTrade(trade) {
  return addDoc(collection(db, COL.trades), {
    ...trade,
    status: 'proposed',
    date: Timestamp.fromDate(trade.date ?? new Date()),
  })
}

export function respondToTrade(tradeId, response) {
  const status = response === 'yes' ? 'accepted' : 'rejected'
  return updateDoc(doc(db, COL.trades, tradeId), { response, status })
}

/**
 * Atomic counter-offer: mark the original trade 'countered' and create the
 * new swapped offer linked back via parentTradeId. Mirrors the iOS
 * counter-offer service (batch write).
 */
export function counterTrade(originalTradeId, newTrade) {
  const batch = writeBatch(db)
  batch.update(doc(db, COL.trades, originalTradeId), { status: 'countered' })
  batch.set(doc(collection(db, COL.trades)), {
    ...newTrade,
    status: 'proposed',
    parentTradeId: originalTradeId,
    date: Timestamp.fromDate(newTrade.date ?? new Date()),
  })
  return batch.commit()
}

/**
 * Atomic: transfer every asset on both sides, then mark the trade completed.
 * Mirrors executeTrade + applyTransfer.
 */
export async function executeTrade(tradeId, meta = {}) {
  const tradeSnap = await getDoc(doc(db, COL.trades, tradeId))
  if (!tradeSnap.exists()) throw new Error('Trade not found')
  const trade = tradeSnap.data()
  // Guard against double-execution: re-applying the swaps would trade the
  // assets straight back (and stack bogus tradeHistory entries).
  if (trade.status === 'completed') throw new Error('Trade already executed')
  if (trade.status !== 'accepted' && trade.status !== 'proposed') {
    throw new Error(`Trade is ${trade.status} — only accepted trades can be executed`)
  }

  const batch = writeBatch(db)
  const note = (from) => `via ${from}`

  const applyTransfer = (assetRef, toTeam, fromTeam) => {
    if (assetRef.assetType === 'player') {
      batch.update(doc(db, COL.players, assetRef.assetId), {
        teamName: toTeam,
        tradeHistory: arrayUnion(note(fromTeam)),
      })
    } else {
      batch.update(doc(db, COL.draftPicks, assetRef.assetId), {
        currentTeamName: toTeam,
        tradeHistory: arrayUnion(note(fromTeam)),
      })
    }
    // Ledger entry in the same batch — the trade and its history land
    // atomically or not at all
    batch.set(doc(collection(db, COL.transactions)), {
      type: 'trade',
      season: meta.season ?? trade.season ?? null,
      teamName: toTeam,
      fromTeam,
      playerId: assetRef.assetId,
      playerName: assetRef.displayName ?? null,
      assetType: assetRef.assetType,
      relatedTradeId: tradeId,
      actorUid: meta.actorUid ?? null,
      createdAt: Timestamp.now(),
    })
  }

  for (const ref of trade.assetsFromProposer ?? []) {
    applyTransfer(ref, trade.receivingTeamName, trade.proposingTeamName)
  }
  for (const ref of trade.assetsFromReceiver ?? []) {
    applyTransfer(ref, trade.proposingTeamName, trade.receivingTeamName)
  }

  batch.update(doc(db, COL.trades, tradeId), {
    status: 'completed',
    completedAt: Timestamp.now(),
  })
  return batch.commit()
}

// ── Dropped-player lifecycle (§Rosters + §Luxury Tax) ─────────
// A drafted/kept player who is dropped keeps his salary until he clears
// 2 FAAB auctions. Claimed first → salary follows to the new team.
// Cleared → value resets to $2 and he leaves the cap system.
// salaryStatus: 'rostered' (default, missing field) | 'dropped_pending' | 'cleared'

const txRef = () => doc(collection(db, COL.transactions))

/** Drop a rostered player — clock starts at 0 of 2 auctions. */
export function dropPlayer(player, meta = {}) {
  const batch = writeBatch(db)
  batch.update(doc(db, COL.players, player.id), {
    salaryStatus: 'dropped_pending',
    auctionsCleared: 0,
    droppedByTeam: player.teamName ?? null,
  })
  batch.set(txRef(), {
    type: 'drop',
    season: meta.season ?? null,
    week: meta.week ?? null,
    teamName: player.teamName ?? null,
    playerId: player.id,
    playerName: player.name ?? null,
    price: meta.price ?? null,
    note: 'Salary follows until 2 FAAB auctions clear',
    actorUid: meta.actorUid ?? null,
    createdAt: Timestamp.now(),
  })
  return batch.commit()
}

/**
 * Claim a dropped player.
 * Pending → his existing salary follows him and re-enters the new cap.
 * Cleared → he joins as a fresh $2 waiver pickup (Free Agent pool,
 * purchaseYear = this season), which makes him cap-exempt in-season.
 */
export function claimDroppedPlayer(player, toTeam, meta = {}) {
  const wasCleared = player.salaryStatus === 'cleared'
  const batch = writeBatch(db)
  const patch = {
    salaryStatus: 'rostered',
    auctionsCleared: 0,
    teamName: toTeam,
    tradeHistory: arrayUnion(`claimed from waivers (via ${player.droppedByTeam ?? player.teamName ?? '?'})`),
  }
  if (wasCleared && meta.season) {
    patch.playerPool = 'Free Agent'
    patch.purchaseYear = meta.season
    patch.originalPrice = WAIVER_VALUE
  }
  batch.update(doc(db, COL.players, player.id), patch)
  batch.set(txRef(), {
    type: 'claim',
    season: meta.season ?? null,
    week: meta.week ?? null,
    teamName: toTeam,
    fromTeam: player.droppedByTeam ?? player.teamName ?? null,
    playerId: player.id,
    playerName: player.name ?? null,
    price: wasCleared ? WAIVER_VALUE : meta.price ?? null,
    note: wasCleared
      ? 'FAAB pickup after clearing — $2 waiver value, cap-exempt this season'
      : 'Claimed before clearing — salary follows',
    actorUid: meta.actorUid ?? null,
    createdAt: Timestamp.now(),
  })
  return batch.commit()
}

/**
 * Record one FAAB auction passing without a claim. On the second, the
 * player clears: value resets to $2 for the active season and he's out of
 * the cap system for good.
 */
export function markAuctionCleared(player, meta = {}) {
  const cleared = (player.auctionsCleared ?? 0) + 1
  const done = cleared >= WAIVER_CLEARS
  const batch = writeBatch(db)
  const patch = { auctionsCleared: cleared }
  if (done) {
    patch.salaryStatus = 'cleared'
    if (meta.season) patch[`prices.${meta.season}`] = WAIVER_VALUE
  }
  batch.update(doc(db, COL.players, player.id), patch)
  if (done) {
    batch.set(txRef(), {
      type: 'clear',
      season: meta.season ?? null,
      week: meta.week ?? null,
      teamName: player.droppedByTeam ?? player.teamName ?? null,
      playerId: player.id,
      playerName: player.name ?? null,
      price: WAIVER_VALUE,
      note: `Cleared ${WAIVER_CLEARS} FAAB auctions — reset to $${WAIVER_VALUE}`,
      actorUid: meta.actorUid ?? null,
      createdAt: Timestamp.now(),
    })
  }
  return batch.commit().then(() => ({ cleared, done }))
}

/** Undo a mistaken drop — back on the roster, clock wiped, no ledger entry. */
export function undoDrop(player) {
  return updateDoc(doc(db, COL.players, player.id), {
    salaryStatus: 'rostered',
    auctionsCleared: 0,
  })
}

// ── Transaction ledger — every roster/money event, queryable ──
// {type: trade|drop|claim|clear|keep|adjust, season, week?, teamName,
//  playerId, playerName, price?, note?, actorUid?, relatedTradeId?, createdAt}

export function logTransaction(entry) {
  return addDoc(collection(db, COL.transactions), {
    ...entry,
    createdAt: Timestamp.now(),
  })
}

export function listenToTransactions(callback, max = 200) {
  const q = query(collection(db, COL.transactions), orderBy('createdAt', 'desc'), limit(max))
  return onSnapshot(q, (snap) =>
    callback(snapToDocs(snap).map((t) => ({ ...t, createdAt: tsToDate(t.createdAt) }))),
  )
}

// ── Player Interests (legacy star system) ─────────────────────

export function addPlayerInterest(interest) {
  return addDoc(collection(db, COL.interests), {
    ...interest,
    timestamp: Timestamp.now(),
  })
}

export async function removePlayerInterest(assetId, userId) {
  const q = query(
    collection(db, COL.interests),
    where('assetId', '==', assetId),
    where('userId', '==', userId),
  )
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  return batch.commit()
}

export async function getPlayerInterests(userId) {
  const q = query(collection(db, COL.interests), where('userId', '==', userId))
  return snapToDocs(await getDocs(q))
}

export async function fetchAllInterests() {
  return snapToDocs(await getDocs(collection(db, COL.interests)))
}

// ── Messages ──────────────────────────────────────────────────

export function listenToMessages(callback) {
  const q = query(collection(db, COL.messages), orderBy('timestamp', 'desc'), limit(20))
  return onSnapshot(q, (snap) =>
    callback(snapToDocs(snap).map((m) => ({ ...m, timestamp: tsToDate(m.timestamp) }))),
  )
}

export function addMessage(content) {
  return addDoc(collection(db, COL.messages), { content, timestamp: Timestamp.now() })
}

export function deleteMessage(messageId) {
  return deleteDoc(doc(db, COL.messages, messageId))
}

// ── FMK Signals — doc id "{userId}_{assetId}" ─────────────────

export function setFMKSignal(signal) {
  const id = `${signal.userId}_${signal.assetId}`
  return setDoc(doc(db, COL.fmk, id), {
    ...signal,
    timestamp: signal.timestamp ?? Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
}

export async function getFMKSignals(userId) {
  const q = query(collection(db, COL.fmk), where('userId', '==', userId))
  return snapToDocs(await getDocs(q))
}

export function listenToAllFMKSignals(callback) {
  return onSnapshot(collection(db, COL.fmk), (snap) => callback(snapToDocs(snap)))
}

export function removeFMKSignal(userId, assetId) {
  return deleteDoc(doc(db, COL.fmk, `${userId}_${assetId}`))
}

// ── User Settings — doc id = uid ──────────────────────────────

export async function fetchUserSettings(userId) {
  const snap = await getDoc(doc(db, COL.userSettings, userId))
  return snap.exists() ? snap.data() : null
}

export function saveUserSettings(settings, userId) {
  return setDoc(doc(db, COL.userSettings, userId), settings)
}

// ── GroupMe notification mapping — config/groupme ─────────────

export async function fetchGroupMeConfig() {
  const snap = await getDoc(doc(db, COL.config, 'groupme'))
  return snap.exists() ? snap.data() : null
}

export function saveGroupMeConfig(config) {
  return setDoc(doc(db, COL.config, 'groupme'), config, { merge: true })
}

/** Master pause for all GroupMe DMs (checked server-side before every send). */
export function setGroupMePaused(paused) {
  return setDoc(doc(db, COL.config, 'groupme'), { paused }, { merge: true })
}

// ── Rules — proposals + voting (Firestore: "rules") ───────────

export function listenToRules(callback) {
  const q = query(collection(db, 'rules'), orderBy('proposedAt', 'desc'))
  return onSnapshot(q, (snap) =>
    callback(snapToDocs(snap).map((r) => ({ ...r, proposedAt: tsToDate(r.proposedAt) }))),
  )
}

export function proposeRule(rule) {
  return addDoc(collection(db, 'rules'), {
    ...rule,
    status: 'proposed',
    votes: {},
    proposedAt: Timestamp.now(),
  })
}

/**
 * Commissioner manual entry — create or update a rule with full control
 * (any status, decided season, proposer). proposedAt is always stamped on
 * create: the rules listener orders by it, so a doc without it vanishes.
 */
export function saveRule(rule) {
  const { id, ...data } = rule
  if (id) return updateDoc(doc(db, 'rules', id), data).then(() => id)
  return addDoc(collection(db, 'rules'), {
    votes: {},
    ...data,
    proposedAt: Timestamp.now(),
  }).then((r) => r.id)
}

export function deleteRule(ruleId) {
  return deleteDoc(doc(db, 'rules', ruleId))
}

/** One vote per team; re-voting overwrites while the portal is open. */
export function voteOnRule(ruleId, teamName, vote) {
  return updateDoc(doc(db, 'rules', ruleId), { [`votes.${teamName}`]: vote })
}

export function setRulesVotingOpen(open) {
  return updateDoc(doc(db, COL.config, 'league'), { rulesVotingOpen: open })
}

export function setRuleStatus(ruleId, status, decidedSeason) {
  return updateDoc(doc(db, 'rules', ruleId), { status, decidedSeason })
}

/**
 * Atomically apply a whole voting round plus close the portal.
 * `results` come from ruleVoting.tallyVotes. Failed proposals record the
 * season in `rejectionYears` so the two-year-ban rule is computable;
 * deferred ones do NOT (losing a category is not a rejection).
 */
export function applyVoteResults(results, season) {
  const batch = writeBatch(db)
  for (const r of results) {
    const ref = doc(db, 'rules', r.id)
    const patch = { status: r.status, decidedSeason: season, voteReason: r.reason ?? null }
    if (r.status === 'failed') patch.rejectionYears = arrayUnion(season)
    batch.update(ref, patch)
  }
  batch.update(doc(db, COL.config, 'league'), { rulesVotingOpen: false })
  return batch.commit()
}

/**
 * Seed the season's proposals (rulebookSeed.proposals2026) into `rules`.
 * Upserts by seedId — re-running updates the seeded fields in place without
 * duplicating or clobbering any votes already cast. Skips seeds whose title
 * already exists as a hand-entered proposal.
 */
export async function seedRuleProposals(proposals) {
  const existing = snapToDocs(await getDocs(collection(db, 'rules')))
  const byTitle = new Set(existing.filter((r) => !r.seedId).map((r) => r.title?.toLowerCase()))
  const batch = writeBatch(db)
  let count = 0
  for (const p of proposals) {
    if (byTitle.has(p.title.toLowerCase())) continue
    const ref = doc(db, 'rules', p.seedId)
    const prior = existing.find((r) => r.id === p.seedId)
    batch.set(ref, {
      ...p,
      status: prior?.status ?? 'proposed',
      votes: prior?.votes ?? {},
      proposedAt: prior?.proposedAt ?? Timestamp.now(),
    }, { merge: true })
    count++
  }
  await batch.commit()
  return count
}

// ── Weekly Low Points Parlay ──────────────────────────────────
// config/parlay {season, week, lockAt, open} · parlayEntries one per
// team/week (id season_week_team) · parlayWeeks results per week.

export function listenToParlayConfig(callback) {
  return onSnapshot(doc(db, COL.config, 'parlay'), (snap) => {
    const d = snap.exists() ? snap.data() : null
    callback(d ? { ...d, lockAt: tsToDate(d.lockAt) } : null)
  })
}

export function setParlayConfig(patch) {
  const payload = { ...patch }
  if (payload.lockAt instanceof Date) payload.lockAt = Timestamp.fromDate(payload.lockAt)
  return setDoc(doc(db, COL.config, 'parlay'), payload, { merge: true })
}

export function listenToParlayEntries(season, week, callback) {
  const q = query(
    collection(db, 'parlayEntries'),
    where('season', '==', season),
    where('week', '==', week),
  )
  return onSnapshot(q, (snap) =>
    callback(snapToDocs(snap).map((e) => ({ ...e, submittedAt: tsToDate(e.submittedAt) }))),
  )
}

/** Submit or change a pick — deterministic id keeps it one entry per team. */
export function submitParlayEntry({ season, week, teamName, playerId, playerName, userId }) {
  return setDoc(doc(db, 'parlayEntries', `${season}_${week}_${teamName}`), {
    season, week, teamName, playerId, playerName, userId,
    submittedAt: Timestamp.now(),
  })
}

export function saveParlayWeek(weekDoc) {
  return setDoc(doc(db, 'parlayWeeks', `${weekDoc.season}_${weekDoc.week}`), weekDoc, { merge: true })
}

export async function fetchParlayWeeks(season) {
  const q = query(collection(db, 'parlayWeeks'), where('season', '==', season))
  return snapToDocs(await getDocs(q)).sort((a, b) => b.week - a.week)
}

// ── Keeper plans (Team Builder prototypes) — ALWAYS private ───
// Doc: { ownerUid, name, strategy, entries:[{assetId, keep:{0,1,2}}],
//        placeholders:[{id,label,position,prices:{0,1,2}}], updatedAt }

export async function fetchKeeperPlans(uid) {
  const q = query(collection(db, 'keeperPlans'), where('ownerUid', '==', uid))
  const snap = await getDocs(q)
  return snapToDocs(snap).sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
}

export function saveKeeperPlan(plan) {
  const { id, ...doc_ } = plan
  const payload = { ...doc_, updatedAt: Timestamp.now() }
  if (id) return setDoc(doc(db, 'keeperPlans', id), payload).then(() => id)
  return addDoc(collection(db, 'keeperPlans'), { ...payload, createdAt: Timestamp.now() }).then((r) => r.id)
}

export function deleteKeeperPlan(planId) {
  return deleteDoc(doc(db, 'keeperPlans', planId))
}

// ── League Records — game & player extremes (Trophy Room) ─────
// {scope: 'game'|'player', label, team, player?, value, detail?, season?,
//  week?, tone: 'high'|'low', order} — commissioner-entered, gathered
// going forward as weekly data accumulates.

export async function fetchLeagueRecords() {
  const snap = await getDocs(collection(db, 'leagueRecords'))
  return snapToDocs(snap).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

export function saveLeagueRecord(record) {
  const { id, ...data } = record
  const payload = { ...data, updatedAt: Timestamp.now() }
  if (id) return setDoc(doc(db, 'leagueRecords', id), payload, { merge: true }).then(() => id)
  return addDoc(collection(db, 'leagueRecords'), { ...payload, createdAt: Timestamp.now() }).then((r) => r.id)
}

export function deleteLeagueRecord(recordId) {
  return deleteDoc(doc(db, 'leagueRecords', recordId))
}

// ── League History — doc id = season year ─────────────────────

export async function fetchLeagueHistory() {
  const q = query(collection(db, COL.leagueHistory), orderBy('season', 'desc'))
  return snapToDocs(await getDocs(q))
}

export function addSeasonHistory(history) {
  return setDoc(doc(db, COL.leagueHistory, String(history.season)), history)
}
