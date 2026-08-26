// firestoreService — direct port of Services/FirestoreDataService.swift.
// Same collections, same queries, same batch semantics. Listener functions
// return an unsubscribe fn (the JS analogue of ListenerRegistration.remove()).
import { keeperDocId } from './keeperImport.js'
import { assetTypeOf } from '../data/trades2026.js'
import { planHistoricalImport } from './tradeImport.js'
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
  teamAvatars: 'teamAvatars',
  groupmeTradeSignals: 'groupmeTradeSignals',
  bigBoard: 'bigBoard',
  weeklyScores: 'weeklyScores',
  playoffs: 'playoffs',
  tradeVotes: 'tradeVotes',
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

// ── Season rollover — disarmed by default (see services/seasonRollover.js) ──
// A deliberate two-step safety: arming and applying are separate actions,
// and a successful apply auto-disarms so the same arm can't fire twice.

export function setRolloverArmed(armed) {
  return updateDoc(doc(db, COL.config, 'league'), { rolloverArmed: armed })
}

/**
 * Apply a rollover plan (services/seasonRollover.computeRolloverPlan):
 * extend price maps, generate next year's picks, advance activeSeasonYear,
 * auto-disarm. One 'rollover' transaction-ledger entry per updated player
 * (batched, chunked under the 500-op Firestore limit).
 */
export async function applyRollover(plan, meta = {}) {
  const ops = []

  for (const row of plan.priceUpdates) {
    ops.push((batch) => {
      batch.update(doc(db, COL.players, row.id), {
        prices: row.prices,
        contractYearsRemaining: row.contractYearsRemaining,
      })
      batch.set(txRef(), {
        type: 'rollover',
        season: plan.toSeason,
        teamName: row.teamName,
        playerId: row.id,
        playerName: row.name,
        price: row.prices[plan.toSeason] ?? null,
        note: `Season rollover ${plan.fromSeason} → ${plan.toSeason} — price map extended`,
        actorUid: meta.actorUid ?? null,
        createdAt: Timestamp.now(),
      })
    })
  }

  for (const pick of plan.newPicks) {
    ops.push((batch) => {
      batch.set(doc(collection(db, COL.draftPicks)), pick)
    })
  }

  const CHUNK = 200
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + CHUNK)) op(batch)
    await batch.commit()
  }

  // Season advance + auto-disarm as one final write, after the bulk data
  // lands, so a mid-batch failure never leaves the season flipped early.
  await updateDoc(doc(db, COL.config, 'league'), {
    activeSeasonYear: plan.toSeason,
    rolloverArmed: false,
  })

  return { playersUpdated: plan.priceUpdates.length, picksGenerated: plan.newPicks.length }
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

/**
 * Whether the Big Board appears in the navigation.
 *
 * Deliberately NOT part of disabledAreas. That list is admin-exempt --
 * areaEnabled() returns true for the commissioner no matter what -- which
 * is right for hiding things from the league but useless here, because the
 * commissioner is the Big Board's only viewer. This is a plain flag that
 * applies to him too, and it defaults to false (hidden) wherever it's read.
 */
export function setBigBoardInNav(on) {
  return updateDoc(doc(db, COL.config, 'league'), { bigBoardInNav: !!on })
}

export function listenToPlayers(callback) {
  const q = query(collection(db, COL.players), where('isActive', '==', true))
  return onSnapshot(q, (snap) => callback(snapToDocs(snap)))
}

export function addPlayer(player) {
  return addDoc(collection(db, COL.players), player)
}

/**
 * Seed a rookie draft class (data/rookieDraft2026.js) into the players
 * collection. Idempotent: deterministic doc ids + name check, so re-running
 * never duplicates. Also retires that season's draft-pick assets — the
 * picks were spent at the draft, the players now exist instead.
 * Returns {added, skipped, picksRetired}.
 */
export async function seedRookieClass(rookies, season) {
  const existing = snapToDocs(await getDocs(collection(db, COL.players)))
  const names = new Set(existing.filter((p) => p.isActive !== false).map((p) => p.name.toLowerCase()))

  const batch = writeBatch(db)
  let added = 0
  for (const r of rookies) {
    if (names.has(r.name.toLowerCase())) continue
    const id = `rookie${season}-${r.slot.replace('.', '-')}`
    batch.set(doc(db, COL.players, id), {
      name: r.name,
      position: r.position,
      teamName: r.team,
      nflTeam: r.nflTeam ?? null,
      prices: Object.fromEntries(Object.entries(r.prices).map(([y, p]) => [String(y), p])),
      originalPrice: r.originalPrice,
      purchaseYear: season,
      contractYearsRemaining: 1,
      playerPool: 'Rookie Draft',
      rookieRound: r.round,
      rookieDraftYear: season,
      tradeHistory: r.via ? [`${season} ${r.slot} ${r.via}`] : [],
      isActive: true,
      salaryStatus: 'rostered',
    })
    added++
  }

  // Retire the spent picks: any still-available draft pick for this season
  const pickSnap = await getDocs(
    query(collection(db, COL.draftPicks), where('season', '==', season), where('status', '==', 'available')),
  )
  let picksRetired = 0
  for (const p of pickSnap.docs) {
    batch.update(p.ref, { status: 'used' })
    picksRetired++
  }

  await batch.commit()
  return { added, skipped: rookies.length - added, picksRetired }
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

export function listenToTrades(season, callback, onError) {
  const q = query(
    collection(db, COL.trades),
    where('season', '==', season),
    orderBy('date', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snapToDocs(snap).map((t) => ({ ...t, date: tsToDate(t.date) }))),
    // An equality filter plus an orderBy on a different field needs a
    // composite index (see firestore.indexes.json). Without this handler a
    // missing index fails silently — the callback simply never fires and the
    // Trades tab sits empty forever with no clue why. Never leave this off.
    (err) => {
      console.error(`listenToTrades(${season}) failed — trades will render empty:`, err)
      onError?.(err)
    },
  )
}

export function proposeTrade(trade) {
  return addDoc(collection(db, COL.trades), {
    ...trade,
    status: 'proposed',
    date: Timestamp.fromDate(trade.date ?? new Date()),
  })
}

/**
 * Commissioner-only: kill a trade that is still awaiting a response.
 *
 * Sets status 'cancelled' rather than deleting the document, so the trade
 * stays auditable — who proposed what, and that it was pulled rather than
 * declined. 'cancelled' is in neither the pending nor the completed filter,
 * so it leaves both lists and clears the receiver's inbox badge, and it is
 * not 'accepted', so it can never trigger executeTradeAssets.
 */
export function cancelTrade(tradeId, reason) {
  return updateDoc(doc(db, COL.trades, tradeId), {
    status: 'cancelled',
    cancelReason: reason || null,
    cancelledAt: Timestamp.now(),
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
 * Commissioner-only: record a trade that happened OUTSIDE the app — e.g.
 * two teams executed it directly in ESPN without ever proposing it here.
 * There's no pre-existing trade doc and no member consent step to wait
 * on (it already happened); this creates the trade doc as 'completed'
 * and transfers every asset in the same atomic batch, tagged with its
 * source so it's distinguishable in the ledger from an app-native deal.
 *
 * Accepting an in-app trade proposal no longer goes through this —
 * that's now executed server-side by the onTradeWrite Cloud Function the
 * instant a member accepts, since members don't have write access to
 * players/draftPicks directly. This function exists ONLY for the
 * commissioner to backfill a deal this app never saw proposed.
 */
export function recordExternalTrade({ proposingTeamName, receivingTeamName, assetsFromProposer, assetsFromReceiver, notes, season, source = 'espn' }, meta = {}) {
  const batch = writeBatch(db)
  const tradeRef = doc(collection(db, COL.trades))
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
    batch.set(doc(collection(db, COL.transactions)), {
      type: 'trade',
      season: season ?? null,
      teamName: toTeam,
      fromTeam,
      playerId: assetRef.assetId,
      playerName: assetRef.displayName ?? null,
      assetType: assetRef.assetType,
      relatedTradeId: tradeRef.id,
      note: `Recorded from ${source} (manual entry)`,
      actorUid: meta.actorUid ?? null,
      createdAt: Timestamp.now(),
    })
  }

  for (const ref of assetsFromProposer ?? []) applyTransfer(ref, receivingTeamName, proposingTeamName)
  for (const ref of assetsFromReceiver ?? []) applyTransfer(ref, proposingTeamName, receivingTeamName)

  batch.set(tradeRef, {
    proposingTeamName,
    receivingTeamName,
    assetsFromProposer: assetsFromProposer ?? [],
    assetsFromReceiver: assetsFromReceiver ?? [],
    notes: notes || null,
    season: season ?? null,
    status: 'completed',
    source,
    date: Timestamp.now(),
    completedAt: Timestamp.now(),
  })
  return batch.commit().then(() => tradeRef.id)
}

/**
 * Backfill trades that happened before the app tracked them — a ledger
 * write and nothing else.
 *
 * Deliberately NOT recordExternalTrade: that one transfers the assets and
 * stamps `date: now`. These deals are already reflected in the rosters, so
 * re-applying them would double-move players and date every one of them
 * today. This writes `status: 'historical'` docs with their real dates and
 * touches no player or draftPick document.
 *
 * Asset refs carry a displayName and assetType but `assetId: null` — the
 * players and picks named here may since have moved on again, and nothing
 * that renders a historical trade resolves the id (the cap-impact and ESPN
 * checklist paths are both gated on proposed/accepted/completed status).
 *
 * Doc ids are derived from the trade, so re-running overwrites in place and
 * never duplicates.
 */
export async function seedHistoricalTrades(rows, season, meta = {}) {
  const ref = (displayName) => ({
    assetId: null,
    assetType: assetTypeOf(displayName),
    displayName,
  })

  // Equality-only query: no composite index needed.
  const existing = snapToDocs(await getDocs(
    query(collection(db, COL.trades), where('season', '==', season)),
  )).map((t) => ({ ...t, date: tsToDate(t.date) }))

  // planHistoricalImport decides what may be written. It is additive only —
  // an entry this import already created is never rewritten, because these
  // are whole-document writes and a rewrite would discard the hand-written
  // "via X" provenance notes on the 2026 trades. See services/tradeImport.js.
  const { toWrite, skipped } = planHistoricalImport(rows, existing)

  const batch = writeBatch(db)
  for (const { row, id, at } of toWrite) {
    const ts = Timestamp.fromDate(at)
    batch.set(doc(db, COL.trades, id), {
      proposingTeamName: row.a.team,
      receivingTeamName: row.b.team,
      // The sheet lists what each side RECEIVED; these fields are what each
      // side SENDS. That's why the two columns cross over here.
      assetsFromProposer: row.b.received.map(ref),
      assetsFromReceiver: row.a.received.map(ref),
      notes: null,
      season,
      status: 'historical',
      source: meta.source ?? 'keeper-sheet',
      date: ts,
      completedAt: ts,
    })
  }
  if (toWrite.length) await batch.commit()
  return { imported: toWrite.length, skipped }
}

/**
 * Move draft picks that changed hands in trades this app never saw.
 *
 * This is the one asset class a ledger-only import CANNOT skip. Players are
 * safe to leave alone — ESPN is authoritative for them and the rosters here
 * follow it — but ESPN cannot roster a draft pick, so this app is the only
 * place picks exist. A pick traded outside the app therefore never moved,
 * and both teams keep showing the pick they started with.
 *
 * Resolution is exact or it does nothing: season + round + originalTeamName
 * identifies a pick uniquely, since every team owns one per round per
 * season. Anything missing, ambiguous, or already spent is reported rather
 * than guessed at — same rule the ESPN ingest follows.
 *
 * Idempotent: a pick already sitting with the right team is left untouched,
 * so this can be re-run alongside the ledger import safely.
 *
 * Transfers MUST arrive oldest-first (see data/trades2026.pickTransfers) —
 * a pick that changed hands twice has to be replayed in order.
 */
export async function applyPickTransfers(transfers, meta = {}) {
  const picks = snapToDocs(await getDocs(collection(db, COL.draftPicks)))

  const applied = []
  const skipped = []
  // Track in-memory so a pick moved twice in one run resolves off the
  // result of the earlier move, not the stale snapshot.
  const owner = new Map(picks.map((p) => [p.id, p.currentTeamName]))
  const batch = writeBatch(db)
  let writes = 0

  for (const t of transfers) {
    const { season, round, originalTeam } = t.ref
    const matches = picks.filter(
      (p) => Number(p.season) === season && Number(p.round) === round && p.originalTeamName === originalTeam,
    )

    if (matches.length === 0) {
      skipped.push({ ...t, reason: 'no matching pick — already spent, or never generated' })
      continue
    }
    if (matches.length > 1) {
      skipped.push({ ...t, reason: `${matches.length} picks match — not guessing` })
      continue
    }

    const pick = matches[0]
    if (pick.status && pick.status !== 'available') {
      skipped.push({ ...t, reason: `pick is '${pick.status}' — the draft already resolved it` })
      continue
    }
    if (owner.get(pick.id) === t.toTeam) {
      skipped.push({ ...t, reason: 'already owned by the right team' })
      continue
    }

    batch.update(doc(db, COL.draftPicks, pick.id), {
      currentTeamName: t.toTeam,
      tradeHistory: arrayUnion(`via ${t.fromTeam}`),
    })
    batch.set(doc(collection(db, COL.transactions)), {
      type: 'trade',
      season: meta.season ?? null,
      teamName: t.toTeam,
      fromTeam: t.fromTeam,
      playerId: pick.id,
      playerName: t.displayName,
      assetType: 'draftPick',
      note: `Pick transfer backfilled from the Keeper Master trade tab (${t.date})`,
      actorUid: meta.actorUid ?? null,
      createdAt: Timestamp.now(),
    })
    owner.set(pick.id, t.toTeam)
    applied.push({ ...t, pickId: pick.id, from: pick.currentTeamName })
    writes += 1
  }

  if (writes > 0) await batch.commit()
  return { applied, skipped }
}

// ── Trade BOOM/DOOM votes ─────────────────────────────────────
// One permanent verdict per member per trade: which side won it. See
// services/tradeVotes.js for the rules this enforces and firestore.rules
// for where they're actually enforced.

/**
 * Votes for one season. Season is denormalized onto the vote so this stays
 * a single equality filter — no orderBy, so no composite index (the exact
 * trap that left the Trades tab blank; see listenToTrades).
 */
export function listenToTradeVotes(season, callback, onError) {
  const q = query(collection(db, COL.tradeVotes), where('season', '==', season))
  return onSnapshot(
    q,
    (snap) => callback(snapToDocs(snap)),
    (err) => {
      console.error(`listenToTradeVotes(${season}) failed — verdicts will render empty:`, err)
      onError?.(err)
    },
  )
}

/**
 * Cast a verdict. The doc id is what makes the vote permanent and unique:
 * "<tradeId>_<uid>" already exists after your first vote, and the rules
 * allow create only — so a second attempt fails at the database, not just
 * in the UI. Rejection here means you already voted (or you were in the
 * trade); surface it, don't retry.
 */
export function castTradeVote({ tradeId, uid, votedFor, season, voterTeam }) {
  return setDoc(
    doc(db, COL.tradeVotes, `${tradeId}_${uid}`),
    {
      tradeId,
      uid,
      votedFor,
      season: season ?? null,
      voterTeam: voterTeam ?? null,
      createdAt: Timestamp.now(),
    },
    // No merge: a merge would quietly overwrite an existing verdict, which
    // is the one thing this feature must never do.
  )
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

// ── Keeper-deadline CSV reconciliation (see services/keeperImport.js) ──
// Applies a reviewed diff {added, changed} from diffKeeperImport. New
// players get a stable id (team+name slug) so re-importing the same sheet
// is always an update, never a duplicate. Every write also drops a 'keep'
// ledger entry — this is the once-a-year bulk election, worth a paper trail.
// Firestore batches cap at 500 ops; chunk defensively since each row here
// is 2 ops (player + ledger entry).
export async function applyKeeperImport(diff, meta = {}) {
  const ops = []

  for (const row of diff.added) {
    const id = keeperDocId(row.name, row.position)
    ops.push((batch) => {
      batch.set(doc(db, COL.players, id), {
        name: row.name,
        position: row.position,
        teamName: row.team,
        prices: Object.fromEntries(Object.entries(row.prices).map(([y, p]) => [String(y), p])),
        originalPrice: row.originalPrice ?? row.prices[meta.season] ?? 0,
        purchaseYear: row.purchaseYear ?? meta.season,
        contractYearsRemaining: row.contractYearsRemaining ?? 1,
        playerPool: row.playerPool ?? 'Auction',
        rookieRound: row.rookieRound ?? null,
        rookieDraftYear: row.rookieDraftYear ?? null,
        tradeHistory: row.tradeNote ? [row.tradeNote] : [],
        isActive: true,
        salaryStatus: 'rostered',
      })
      batch.set(txRef(), {
        type: 'keep',
        season: meta.season ?? null,
        teamName: row.team,
        playerId: id,
        playerName: row.name,
        price: row.prices[meta.season] ?? null,
        note: 'Keeper-deadline import — new player',
        actorUid: meta.actorUid ?? null,
        createdAt: Timestamp.now(),
      })
    })
  }

  for (const row of diff.changed) {
    ops.push((batch) => {
      const patch = {}
      if (row.changedFields.includes('team')) patch.teamName = row.team
      if (row.changedFields.includes('position')) patch.position = row.position
      if (row.changedFields.some((f) => f.startsWith('prices.'))) {
        patch.prices = { ...row.existing.prices, ...Object.fromEntries(Object.entries(row.prices).map(([y, p]) => [String(y), p])) }
      }
      if (row.changedFields.includes('originalPrice')) patch.originalPrice = row.originalPrice
      if (row.changedFields.includes('purchaseYear')) patch.purchaseYear = row.purchaseYear
      if (row.changedFields.includes('contractYearsRemaining')) patch.contractYearsRemaining = row.contractYearsRemaining
      if (row.changedFields.includes('playerPool')) patch.playerPool = row.playerPool
      batch.update(doc(db, COL.players, row.existingId), patch)
      batch.set(txRef(), {
        type: 'keep',
        season: meta.season ?? null,
        teamName: row.team,
        playerId: row.existingId,
        playerName: row.name,
        price: row.prices[meta.season] ?? null,
        note: `Keeper-deadline import — updated ${row.changedFields.join(', ')}`,
        actorUid: meta.actorUid ?? null,
        createdAt: Timestamp.now(),
      })
    })
  }

  const CHUNK = 200 // ×2 ops each, well under the 500-op batch limit
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + CHUNK)) op(batch)
    await batch.commit()
  }

  return { added: diff.added.length, changed: diff.changed.length }
}

// ── Trade auto-import review queue (ESPN + GroupMe) ─────────────
// Written by ingestEspnTrade / ingestGroupMeMessage (Admin SDK) whenever
// a parsed trade doesn't resolve cleanly (needs_review) or comes from a
// source that always requires a human tap before touching rosters
// (pending_confirmation — GroupMe only). Commissioner-only — see
// firestore.rules.

export async function fetchPendingIngests() {
  const q = query(collection(db, 'tradeIngests'), where('status', 'in', ['needs_review', 'pending_confirmation']))
  const snap = await getDocs(q)
  return snapToDocs(snap)
    .map((i) => ({ ...i, receivedAt: tsToDate(i.receivedAt) }))
    .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0))
}

// ── POD content — config/pod ───────────────────────────────────
// The show's preseason rankings/awards/bold calls plus weekly True
// Record scores. One doc; the three hosts are the only ones who can
// read or write it (see firestore.rules podMember()). Seeded defaults
// live in data/podData.js — this doc wins once it exists.

export async function fetchPodContent() {
  const snap = await getDoc(doc(db, COL.config, 'pod'))
  return snap.exists() ? snap.data() : null
}

export function savePodContent(patch) {
  return setDoc(doc(db, COL.config, 'pod'), patch, { merge: true })
}

/**
 * Replaces one week's True Record scores. Weeks live as a keyed map
 * (`trueRecordWeeks.{season}.{week}`) rather than an array so a re-entered
 * week overwrites cleanly instead of appending a duplicate.
 */
export function savePodWeekScores(season, week, scores) {
  return setDoc(
    doc(db, COL.config, 'pod'),
    { trueRecordWeeks: { [String(season)]: { [String(week)]: scores } } },
    { merge: true },
  )
}

// ── Weekly scores — weeklyScores/{season} ──────────────────────
// The league's week-by-week points, one doc per season:
//   { season, weeks: { "1": [{teamName, points}], "2": [...] } }
//
// These deliberately live OUTSIDE config/pod. Raw weekly scores are not
// a POD secret — every manager sees them in ESPN on Monday morning — and
// keeping them in the POD-gated doc meant the other nine teams couldn't
// be shown a chart built from their own results. What stays private is
// the ANALYSIS (True Record, rankings, awards, bold calls), which is
// still computed and displayed only inside the POD tab.
//
// Writes stay with the three hosts (isPodMember in firestore.rules) —
// they're the ones who enter scores each week, so nobody loses an
// ability they had when this lived in config/pod.

export function listenToWeeklyScores(season, callback) {
  return onSnapshot(
    doc(db, COL.weeklyScores, String(season)),
    (snap) => {
      const d = snap.exists() ? snap.data() : {}
      callback({ weeks: d.weeks ?? {}, records: d.records ?? {} })
    },
    // A member without read access shouldn't break the Dashboard — the
    // charts degrade to their empty state instead of throwing.
    () => callback({ weeks: {}, records: {} }),
  )
}

/**
 * Season W-L records, stored beside the weekly scores because they're the
 * same thing at a different resolution and come from the same place.
 * Feeds playoff seeding and the True Record luck column, which has been
 * showing "—" because nothing ever wrote this.
 * @param records - { [teamName]: {wins, losses, ties} }
 */
export function saveTeamRecords(season, records) {
  return setDoc(
    doc(db, COL.weeklyScores, String(season)),
    { season: Number(season), records, updatedAt: Timestamp.now() },
    { merge: true },
  )
}

export async function fetchWeeklyScores(season) {
  const snap = await getDoc(doc(db, COL.weeklyScores, String(season)))
  return snap.exists() ? (snap.data().weeks ?? {}) : {}
}

/**
 * Replaces one week's scores. Weeks are a keyed map rather than an array
 * so re-entering a week overwrites it cleanly instead of appending a
 * duplicate.
 */
export function saveWeekScores(season, week, scores) {
  return setDoc(
    doc(db, COL.weeklyScores, String(season)),
    { season: Number(season), weeks: { [String(week)]: scores }, updatedAt: Timestamp.now() },
    { merge: true },
  )
}

/**
 * One-time move of weekly scores out of config/pod into weeklyScores/.
 * Copies rather than cuts: config/pod keeps its trueRecordWeeks until
 * the new path is proven, so a bad migration costs nothing. Returns a
 * per-season summary for the Admin UI to display.
 */
export async function migrateWeeklyScoresFromPod() {
  const pod = await fetchPodContent()
  const bySeason = pod?.trueRecordWeeks ?? {}
  const results = []

  for (const [season, weeks] of Object.entries(bySeason)) {
    const weekKeys = Object.keys(weeks ?? {})
    if (weekKeys.length === 0) continue
    await setDoc(
      doc(db, COL.weeklyScores, String(season)),
      { season: Number(season), weeks, updatedAt: Timestamp.now() },
      { merge: true },
    )
    results.push({ season, weeks: weekKeys.length })
  }
  return results
}

// ── Playoffs — playoffs/{season} ───────────────────────────────
// { season, selections: { "1": teamName, ... }, winners: { "1": [...] },
//   startedAt }
//
// Commissioner-write. The opponent picks are the managers' decisions, but
// the commissioner records them — the same on-behalf pattern the Rules
// Committee actions already use, and it keeps the security rules simple
// (a member-write rule would have to resolve seeds inside firestore.rules).

export function listenToPlayoffs(season, callback) {
  return onSnapshot(
    doc(db, COL.playoffs, String(season)),
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null),
  )
}

export function savePlayoffs(season, patch) {
  return setDoc(
    doc(db, COL.playoffs, String(season)),
    { season: Number(season), ...patch, updatedAt: Timestamp.now() },
    { merge: true },
  )
}

/**
 * Clears the bracket back to nothing.
 *
 * Uses setDoc WITHOUT merge on purpose: a merge can't remove the existing
 * selections/winners maps, so a "reset" that merged would leave every
 * pick exactly where it was.
 */
export function resetPlayoffs(season) {
  return setDoc(
    doc(db, COL.playoffs, String(season)),
    { season: Number(season), selections: {}, winners: {}, updatedAt: Timestamp.now() },
  )
}

export function dismissTradeIngest(id) {
  return updateDoc(doc(db, 'tradeIngests', id), { status: 'ignored', resolvedAt: Timestamp.now() })
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

// ── Team profile pictures — teamAvatars/{teamName} ─────────────
// One doc per team: either {dataUrl} for an uploaded picture or
// {presetId} for a built-in. Everyone in the league reads every team's
// avatar (they show up all over the app); only the team's own owner (or
// the commissioner) can write one — see firestore.rules.

export function listenToTeamAvatars(callback) {
  return onSnapshot(collection(db, COL.teamAvatars), (snap) => {
    const map = {}
    for (const d of snap.docs) map[d.id] = d.data()
    callback(map)
  })
}

/** Writes an uploaded picture, clearing any preset it replaces. */
export function saveTeamAvatarImage(teamName, dataUrl, uid) {
  return setDoc(doc(db, COL.teamAvatars, teamName), {
    dataUrl, presetId: null, updatedAt: Timestamp.now(), updatedBy: uid ?? null,
  })
}

/** Writes a built-in pick, clearing any upload it replaces. */
export function saveTeamAvatarPreset(teamName, presetId, uid) {
  return setDoc(doc(db, COL.teamAvatars, teamName), {
    presetId, dataUrl: null, updatedAt: Timestamp.now(), updatedBy: uid ?? null,
  })
}

/** Back to the team's shipped logo. */
export function clearTeamAvatar(teamName) {
  return deleteDoc(doc(db, COL.teamAvatars, teamName))
}

// ── GroupMe trade signals — groupmeTradeSignals/{messageId} ────
// Written by the pollGroupMeTrades scheduled function (functions/index.js):
// GroupMe chatter that looks like a trade announcement, captured as an
// UNREVIEWED signal. Nothing is auto-applied — league shorthand ("27 1st"),
// jokes and backouts ("I BACKED OUT") make that unsafe — so these are a
// review inbox in Admin → Trade Signals, where the commissioner pairs them
// with the ESPN-imported player legs and records the picks by hand.
// Commissioner-only; see firestore.rules.

export function listenToGroupMeTradeSignals(callback, max = 50) {
  const q = query(
    collection(db, COL.groupmeTradeSignals),
    orderBy('capturedAt', 'desc'),
    limit(max),
  )
  return onSnapshot(q, (snap) =>
    callback(
      snapToDocs(snap).map((s) => ({
        ...s,
        postedAt: tsToDate(s.postedAt),
        capturedAt: tsToDate(s.capturedAt),
      })),
    ),
  )
}

/** Move a signal through the review workflow ('unreviewed' | 'reviewed' | 'ignored'). */
export function setTradeSignalStatus(signalId, status) {
  return updateDoc(doc(db, COL.groupmeTradeSignals, signalId), {
    status,
    reviewedAt: Timestamp.now(),
  })
}

export function deleteTradeSignal(signalId) {
  return deleteDoc(doc(db, COL.groupmeTradeSignals, signalId))
}

// ── Big Board — bigBoard/{id} ──────────────────────────────────
// The commissioner's keeper-planning board: every draftable player in a
// tier, marked Keep / Drop / Maybe, with a running $200 auction budget
// per team. Commissioner-only in firestore.rules — these are his private
// calls on other people's players and must not leak to the league.
//
// Ported from a standalone Supabase-backed page. That version was
// world-writable: its anon key shipped in public HTML and the table's RLS
// policies allowed read, update and insert to anyone. Moving it here puts
// it behind the same auth as everything else.

export function listenToBigBoard(callback) {
  return onSnapshot(collection(db, COL.bigBoard), (snap) =>
    callback(snapToDocs(snap)),
  )
}

/** Patch one player — tier move, K/D/M flip, price edit. */
export function updateBigBoardPlayer(id, fields) {
  return updateDoc(doc(db, COL.bigBoard, String(id)), fields)
}

/**
 * One-time migration from the old Supabase table. Reads live rows with the
 * anon key (already public — it shipped in board.html) and writes them into
 * Firestore keyed by the original id, so re-running overwrites rather than
 * duplicating. Returns {imported}.
 */
export async function importBigBoardFromSupabase() {
  const SB_URL = 'https://vmambvgovdxepgejdgcy.supabase.co'
  const SB_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtYW1idmdvdmR4ZXBnZWpkZ2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0ODczNDEsImV4cCI6MjEwMjA2MzM0MX0.oj4Tgbg-Y7mTiaB7QCAl2vx9WsxvJXJ4RV_AnhP4h0w'
  const res = await fetch(`${SB_URL}/rest/v1/big_board?select=*&order=id`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${res.statusText}`)
  const rows = await res.json()

  const CHUNK = 200 // Firestore caps a batch at 500 ops
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const r of rows.slice(i, i + CHUNK)) {
      batch.set(doc(db, COL.bigBoard, String(r.id)), {
        player: r.player ?? '',
        pos: r.pos ?? '',
        tier: r.tier ?? 'Bench',
        team: r.team ?? '',
        price: Number(r.price) || 0,
        kdm: r.kdm ?? 'M',
      })
    }
    await batch.commit()
  }
  return { imported: rows.length }
}
