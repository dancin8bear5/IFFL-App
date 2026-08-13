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
export async function executeTrade(tradeId) {
  const tradeSnap = await getDoc(doc(db, COL.trades, tradeId))
  if (!tradeSnap.exists()) throw new Error('Trade not found')
  const trade = tradeSnap.data()

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
  return setDoc(doc(db, COL.config, 'groupme'), config)
}

// ── League History — doc id = season year ─────────────────────

export async function fetchLeagueHistory() {
  const q = query(collection(db, COL.leagueHistory), orderBy('season', 'desc'))
  return snapToDocs(await getDocs(q))
}

export function addSeasonHistory(history) {
  return setDoc(doc(db, COL.leagueHistory, String(history.season)), history)
}
