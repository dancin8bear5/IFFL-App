const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {Timestamp, FieldValue} = require("firebase-admin/firestore");
const crypto = require("crypto");
const {validatePayload, matchPlayers, pickSides} = require("./tradeIngest");
const {resolveGroupMeTrade} = require("./groupmeIngest");

admin.initializeApp();
const db = admin.firestore();

// GroupMe personal access token — set once from the Mac terminal:
//   firebase functions:secrets:set GROUPME_TOKEN
// Never lives in git, the app bundle, or Firestore.
const GROUPME_TOKEN = defineSecret("GROUPME_TOKEN");

// Shared secret the ESPN-trade-ingest webhook checks on every request —
// set once from the Mac terminal:
//   firebase functions:secrets:set TRADE_INGEST_SECRET
// Generate it with e.g. `openssl rand -hex 32`. Never lives in git, the
// app bundle, or Firestore. The Make.com scenario sends it back on every
// call as the X-Ingest-Secret header.
const TRADE_INGEST_SECRET = defineSecret("TRADE_INGEST_SECRET");

const APP_URL = "https://iffl-auth.web.app";
const COMMISSIONER_EMAIL = "jaredrogtaylor@gmail.com";
const COMMISSIONER_TEAM_NAME = "Jared";

/**
 * Resolves a fantasy team name to an FCM token by inverting
 * config/league.userTeamMap → users/{uid}.fcmToken.
 */
async function fcmTokenForTeam(teamName) {
  const config = await db.doc("config/league").get();
  const userTeamMap = config.data()?.userTeamMap ?? {};
  const uid = Object.keys(userTeamMap).find((u) => userTeamMap[u] === teamName);
  if (!uid) return null;
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.data()?.fcmToken ?? null;
}

async function sendPush(teamName, title, body) {
  const token = await fcmTokenForTeam(teamName);
  if (!token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      apns: {
        payload: { aps: { badge: 1, sound: "default" } },
      },
    });
  } catch (err) {
    // Token stale or device unregistered — non-fatal
    console.warn(`FCM send failed for ${teamName}:`, err.message);
  }
}

// ── GroupMe direct messages ────────────────────────────────────
// Mapping lives in config/groupme: { userMap: { "<teamName>": "<groupmeUserId>" } }
// DMs are sent from the commissioner's GroupMe account (the token owner).

async function sendGroupMeDM(teamName, text) {
  const token = GROUPME_TOKEN.value();
  if (!token) return;
  const cfgSnap = await db.doc("config/groupme").get();
  const cfg = cfgSnap.data() ?? {};
  // Master pause switch (Admin → GroupMe) — silences ALL DMs while testing
  if (cfg.paused) {
    console.log(`GroupMe: paused — skipping DM to ${teamName}`);
    return;
  }
  const recipientId = cfg.userMap?.[teamName] ?? null;
  if (!recipientId) {
    console.log(`GroupMe: no mapping for team ${teamName} — skipping DM`);
    return;
  }
  try {
    const res = await fetch(`https://api.groupme.com/v3/direct_messages?token=${token}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        direct_message: {
          source_guid: crypto.randomUUID(),
          recipient_id: recipientId,
          text,
        },
      }),
    });
    if (!res.ok) {
      console.warn(`GroupMe DM to ${teamName} failed: HTTP ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`GroupMe DM to ${teamName} failed:`, err.message);
  }
}

/** "Jefferson, 2027 R1" style summary of one side of a trade. */
function assetSummary(refs) {
  const names = (refs ?? []).map((a) => a.displayName);
  return names.length ? names.join(", ") : "nothing";
}

/**
 * The "it's official" notification — fired whenever a trade lands on
 * status 'completed', whichever path got it there: a member's accept
 * auto-executing, the commissioner's Record External Trade tool, or the
 * ESPN email auto-import. `source` tags the message so recipients know
 * how it got there.
 */
async function notifyCompleted(proposer, receiver, youGet, theyGet, source) {
  const tag = source === "espn-email" ? " (auto-recorded from an ESPN trade email)"
    : source === "espn" ? " (recorded from ESPN)"
    : source === "groupme" ? " (confirmed from GroupMe)"
    : "";
  await sendPush(proposer, "Trade Executed", `Your trade with ${receiver} has been completed${tag}.`);
  await sendPush(receiver, "Trade Executed", `Your trade with ${proposer} has been completed${tag}.`);
  await sendGroupMeDM(proposer,
    `🤝 Trade with ${receiver} is executed and official${tag}. Rosters are updated in the app.`);
  await sendGroupMeDM(receiver,
    `🤝 Trade with ${proposer} is executed and official${tag}. Rosters are updated in the app.`);
}

/**
 * Every accepted trade is a legit trade — no separate commissioner
 * approval step. This is what actually makes an accept real: it runs
 * with the Admin SDK (trusted, bypasses Firestore rules), so members
 * never need write access to players/draftPicks/transactions — they
 * only ever write status:'accepted' on their own trade doc, which the
 * existing rules already allow.
 *
 * Wrapped in a transaction that re-reads the trade fresh and no-ops if
 * it's not still 'accepted' — Cloud Functions redeliver events at least
 * once, and this makes a duplicate delivery a safe no-op instead of a
 * double-executed trade.
 *
 * Flipping status to 'completed' here is itself a new document write,
 * so onTradeWrite fires again automatically and the "completed" case
 * below sends the real notification — no separate messaging needed here.
 */
async function executeTradeAssets(tradeId) {
  await db.runTransaction(async (tx) => {
    const tradeRef = db.collection("trades").doc(tradeId);
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return;
    const trade = snap.data();
    if (trade.status !== "accepted") return; // already executed, or moved on

    const note = (from) => `via ${from}`;
    const applyTransfer = (assetRef, toTeam, fromTeam) => {
      const col = assetRef.assetType === "player" ? "players" : "draftPicks";
      const field = assetRef.assetType === "player" ? "teamName" : "currentTeamName";
      tx.update(db.collection(col).doc(assetRef.assetId), {
        [field]: toTeam,
        tradeHistory: admin.firestore.FieldValue.arrayUnion(note(fromTeam)),
      });
      tx.set(db.collection("transactions").doc(), {
        type: "trade",
        season: trade.season ?? null,
        teamName: toTeam,
        fromTeam,
        playerId: assetRef.assetId,
        playerName: assetRef.displayName ?? null,
        assetType: assetRef.assetType,
        relatedTradeId: tradeId,
        actorUid: null,
        createdAt: admin.firestore.Timestamp.now(),
      });
    };

    for (const ref of trade.assetsFromProposer ?? []) {
      applyTransfer(ref, trade.receivingTeamName, trade.proposingTeamName);
    }
    for (const ref of trade.assetsFromReceiver ?? []) {
      applyTransfer(ref, trade.proposingTeamName, trade.receivingTeamName);
    }

    tx.update(tradeRef, {
      status: "completed",
      completedAt: admin.firestore.Timestamp.now(),
    });
  });
}

/**
 * Fires on every write to the trades collection.
 * Sends FCM push (iOS) + GroupMe DM to the relevant team(s).
 */
exports.onTradeWrite = onDocumentWritten(
  {document: "trades/{tradeId}", secrets: [GROUPME_TOKEN]},
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (!after) return null;

    const proposer = after.proposingTeamName;
    const receiver = after.receivingTeamName;
    const youGet = assetSummary(after.assetsFromProposer);
    const theyGet = assetSummary(after.assetsFromReceiver);

    // New trade created
    if (!before) {
      // Created directly as 'completed' — Record External Trade or the
      // ESPN email auto-import. There was no offer to notify anyone
      // about; it's already done.
      if (after.status === "completed") {
        await notifyCompleted(proposer, receiver, youGet, theyGet, after.source);
        return null;
      }
      // Counter-offers: the original trade's status→countered already notified
      // the proposer via push; but the DM for a counter should reach the NEW
      // receiver (the original proposer) with the new terms — send it here.
      if (after.parentTradeId) {
        await sendGroupMeDM(
          receiver,
          `🏈 ${proposer} countered your trade offer.\n` +
          `You'd get: ${theyGet}\nThey'd get: ${youGet}\n` +
          `Respond in the app: ${APP_URL}`,
        );
        return null;
      }
      await sendPush(
        receiver,
        `Trade Offer from ${proposer}`,
        `${proposer} wants to make a deal. Open the app to review.`
      );
      await sendGroupMeDM(
        receiver,
        `🏈 ${proposer} sent you a trade offer!\n` +
        `You'd get: ${youGet}\nThey'd get: ${theyGet}\n` +
        (after.notes ? `"${after.notes}"\n` : "") +
        `Accept, decline, or counter: ${APP_URL}`,
      );
      return null;
    }

    // No status change — nothing to notify
    if (before.status === after.status) return null;

    switch (after.status) {
      case "accepted":
        // No separate approval step — this IS the execution. Runs the
        // asset transfer immediately; the resulting write to 'completed'
        // re-triggers this function and the case below sends the DM.
        try {
          await executeTradeAssets(event.params.tradeId);
        } catch (err) {
          console.error(`Trade ${event.params.tradeId} auto-execute failed:`, err);
        }
        break;

      case "rejected":
        await sendPush(proposer, "Trade Declined",
          `${receiver} declined your trade offer.`);
        await sendGroupMeDM(
          proposer,
          `❌ ${receiver} declined your trade offer (${theyGet} for ${youGet}). ` +
          `Back to the drawing board: ${APP_URL}`,
        );
        break;

      case "countered":
        // DM for the new terms goes out when the counter document is created
        // (see parentTradeId branch above) — push only here to avoid doubles.
        await sendPush(proposer, `Counter Offer from ${receiver}`,
          `${receiver} sent a counter-offer. Open the app to review.`);
        break;

      case "completed":
        await notifyCompleted(proposer, receiver, youGet, theyGet, after.source);
        break;

      default:
        break;
    }

    return null;
  },
);

// ── Cross-source trade correlation ──────────────────────────────
// The same real-world trade can show up from two different signals: an
// ESPN email (players only — ESPN doesn't roster draft picks) and a
// GroupMe announcement (which is where picks in a deal actually get
// said out loud). teamPairKey gives every tradeIngests doc, regardless
// of source, a source-agnostic join key so the two can find each other.
const MERGE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h — generous, but a specific two-team pair trading twice in 3 days is rare enough that a false merge is very unlikely
function teamPairKey(a, b) {
  return [a, b].sort().join("|");
}

/** Most recent ALREADY-APPLIED trade for this team pair within the merge window, if any. */
async function findRecentAppliedTradeForPair(pairKey) {
  const snap = await db.collection("tradeIngests").where("teamPairKey", "==", pairKey).get();
  const cutoff = Date.now() - MERGE_WINDOW_MS;
  const applied = snap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter((doc) => doc.status === "applied" && doc.tradeId && (doc.receivedAt?.toMillis?.() ?? 0) >= cutoff)
    .sort((a, b) => b.receivedAt.toMillis() - a.receivedAt.toMillis());
  return applied[0] ?? null;
}

/** Most recent unconfirmed GroupMe pending item for this team pair within the merge window, if any. */
async function findRecentPendingForPair(pairKey) {
  const snap = await db.collection("tradeIngests").where("teamPairKey", "==", pairKey).get();
  const cutoff = Date.now() - MERGE_WINDOW_MS;
  const pending = snap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter((doc) => doc.status === "pending_confirmation" && (doc.receivedAt?.toMillis?.() ?? 0) >= cutoff)
    .sort((a, b) => b.receivedAt.toMillis() - a.receivedAt.toMillis());
  return pending[0] ?? null;
}

/**
 * ESPN trade auto-import. Called by the Make.com scenario that scrapes
 * the Gmail ESPN-trade-notification emails and parses them — this
 * function is the "verify if we already know it, then ingest and update
 * the data store" half of that pipeline.
 *
 * POST { sourceId, tradeDate?, moves: [{player, fromEspnTeam, toEspnTeam}], rawText? }
 * Header: X-Ingest-Secret: <TRADE_INGEST_SECRET>
 *
 * Flow:
 *   1. Verify — sourceId is checked against tradeIngests/{sourceId}. If
 *      it already exists, this exact event was already processed
 *      (applied OR flagged) and nothing happens again. This is the
 *      literal "do we already know this trade" check, keyed on
 *      whatever stable id the scraper sends (Gmail message id is ideal).
 *   2. Ingest — every move's player name is matched against the LIVE
 *      roster of the team ESPN says he's coming from. Only when every
 *      leg resolves to exactly one player does it apply: all assets
 *      transfer, a trade doc lands as 'completed' with source
 *      'espn-email', and it's logged to the transaction ledger — same
 *      shape as any other completed trade, so Rosters/cap/Keeper
 *      Outlook all just see it. A trade that doesn't resolve cleanly
 *      (typo, name not on the roster this app has, ambiguous duplicate
 *      name) is written to tradeIngests as 'needs_review' instead of
 *      guessed at, and the commissioner gets a GroupMe DM — resolve it
 *      from Admin → Trades.
 */
exports.ingestEspnTrade = onRequest(
  {secrets: [TRADE_INGEST_SECRET, GROUPME_TOKEN]},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "POST only"});
      return;
    }
    if (req.get("X-Ingest-Secret") !== TRADE_INGEST_SECRET.value()) {
      res.status(401).json({ok: false, error: "Unauthorized"});
      return;
    }

    const validation = validatePayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ok: false, error: validation.error});
      return;
    }
    const {sourceId, tradeDate, rawText} = req.body;
    const moves = validation.moves;

    // Step 1: verify — have we already seen this exact source event?
    const ingestRef = db.collection("tradeIngests").doc(sourceId);
    const existing = await ingestRef.get();
    if (existing.exists) {
      res.status(200).json({ok: true, status: "duplicate", previousStatus: existing.data().status});
      return;
    }

    // Live roster snapshot for the teams this trade touches (targeted —
    // Firestore 'in' caps at 30, a trade never touches more than a
    // handful of the league's 12 teams).
    const teams = [...new Set(moves.map((m) => m.fromTeam))];
    const rosterSnap = await db.collection("players")
      .where("teamName", "in", teams)
      .where("isActive", "==", true)
      .get();
    const roster = rosterSnap.docs.map((d) => ({id: d.id, name: d.data().name, teamName: d.data().teamName}));

    const match = matchPlayers(moves, roster);

    // Step 2a: ingest failed to resolve cleanly — flag for review, don't guess.
    if (!match.ok) {
      await ingestRef.set({
        sourceId,
        status: "needs_review",
        moves,
        problems: match.problems,
        tradeDateRaw: tradeDate ?? null,
        rawText: rawText ?? null,
        receivedAt: Timestamp.now(),
      });
      await sendGroupMeDM(
        COMMISSIONER_TEAM_NAME,
        `⚠️ ESPN trade auto-import needs review:\n` +
        match.problems.map((p) => `• ${p.reason}`).join("\n") +
        `\nResolve it from Admin → Trades: ${APP_URL}`,
      ).catch(() => {});
      res.status(200).json({ok: true, status: "needs_review", problems: match.problems});
      return;
    }

    // Step 2b: every leg resolved — ingest it. Same shape as any other
    // completed trade (Rosters/cap/Keeper Outlook don't need to know
    // where it came from), tagged source:'espn-email' for the ledger.
    const configSnap = await db.doc("config/league").get();
    const season = configSnap.data()?.activeSeasonYear ?? null;
    const {proposingTeamName, receivingTeamName} = pickSides(match.resolved);
    const pairKey = teamPairKey(proposingTeamName, receivingTeamName);
    const tradeRef = db.collection("trades").doc();

    const toRef = (m) => ({assetType: "player", assetId: m.assetId, displayName: m.displayName, teamName: m.toTeam});
    const assetsFromProposer = match.resolved.filter((m) => m.fromTeam === proposingTeamName).map(toRef);
    const assetsFromReceiver = match.resolved.filter((m) => m.fromTeam !== proposingTeamName).map(toRef);

    await db.runTransaction(async (tx) => {
      for (const m of match.resolved) {
        tx.update(db.collection("players").doc(m.assetId), {
          teamName: m.toTeam,
          tradeHistory: FieldValue.arrayUnion(`via ${m.fromTeam} (ESPN)`),
        });
        tx.set(db.collection("transactions").doc(), {
          type: "trade",
          season,
          teamName: m.toTeam,
          fromTeam: m.fromTeam,
          playerId: m.assetId,
          playerName: m.displayName,
          assetType: "player",
          relatedTradeId: tradeRef.id,
          note: "Auto-recorded from ESPN trade email",
          actorUid: null,
          createdAt: Timestamp.now(),
        });
      }
      tx.set(tradeRef, {
        proposingTeamName,
        receivingTeamName,
        assetsFromProposer,
        assetsFromReceiver,
        notes: null,
        season,
        status: "completed",
        source: "espn-email",
        date: Timestamp.now(),
        completedAt: Timestamp.now(),
      });
      tx.set(ingestRef, {
        sourceId,
        status: "applied",
        tradeId: tradeRef.id,
        teamPairKey: pairKey,
        moves: match.resolved,
        tradeDateRaw: tradeDate ?? null,
        rawText: rawText ?? null,
        receivedAt: Timestamp.now(),
      });
    });

    // ESPN doesn't roster draft picks — if this pair also has an
    // unconfirmed GroupMe pending item waiting (usually the pick side of
    // this exact trade), link it to the trade we just created instead of
    // leaving it to become a duplicate "create a new trade" confirm later.
    // Confirming it from Admin will now ATTACH those extra assets to this
    // trade rather than starting a second one.
    const pendingGroupMe = await findRecentPendingForPair(pairKey);
    if (pendingGroupMe && !pendingGroupMe.attachToTradeId) {
      await db.collection("tradeIngests").doc(pendingGroupMe.id).update({attachToTradeId: tradeRef.id});
    }

    res.status(200).json({ok: true, status: "applied", tradeId: tradeRef.id});
  },
);

/**
 * GroupMe trade-announcement ingest. Called by the Make.com relay
 * watching the league's GroupMe group (config/groupme.groupId — the
 * same group already used for outbound trade DMs) for new messages.
 *
 * Unlike ingestEspnTrade, this NEVER auto-applies, no matter how
 * cleanly it parses — GroupMe is free-text human chat (jokes, rumors,
 * deals that fall through mid-negotiation), not a templated
 * confirmation email. A clean parse becomes a 'pending_confirmation'
 * tradeIngests doc; the commissioner taps Confirm in Admin → Trades
 * (see exports.confirmPendingTrade below) before anything touches
 * rosters. See functions/groupmeIngest.js for the actual parsing.
 *
 * POST body: the GroupMe message object (id, group_id, sender_id, name,
 * text, system). Header: X-Ingest-Secret: <TRADE_INGEST_SECRET> (same
 * secret as the ESPN webhook — same trust boundary, one thing to manage).
 */
exports.ingestGroupMeMessage = onRequest(
  {secrets: [TRADE_INGEST_SECRET, GROUPME_TOKEN]},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "POST only"});
      return;
    }
    if (req.get("X-Ingest-Secret") !== TRADE_INGEST_SECRET.value()) {
      res.status(401).json({ok: false, error: "Unauthorized"});
      return;
    }

    const body = req.body ?? {};
    const messageId = body.id;
    if (!messageId) {
      res.status(400).json({ok: false, error: "id is required"});
      return;
    }
    if (body.system) {
      res.status(200).json({ok: true, status: "ignored", reason: "system message"});
      return;
    }
    const text = String(body.text ?? "");
    if (!text.trim()) {
      res.status(200).json({ok: true, status: "ignored", reason: "no text"});
      return;
    }

    const groupmeCfg = (await db.doc("config/groupme").get()).data() ?? {};
    if (!groupmeCfg.groupId || String(body.group_id ?? "") !== String(groupmeCfg.groupId)) {
      res.status(200).json({ok: true, status: "ignored", reason: "not the trade-announcement group"});
      return;
    }

    const ingestId = `groupme-${messageId}`;
    const ingestRef = db.collection("tradeIngests").doc(ingestId);
    if ((await ingestRef.get()).exists) {
      res.status(200).json({ok: true, status: "duplicate"});
      return;
    }

    const senderId = body.sender_id ?? body.user_id ?? null;
    const senderName = body.name ?? null;
    const userMap = groupmeCfg.userMap ?? {};
    const senderTeam = Object.keys(userMap).find((team) => String(userMap[team]) === String(senderId)) ?? null;

    const [rosterSnap, picksSnap] = await Promise.all([
      db.collection("players").where("isActive", "==", true).get(),
      db.collection("draftPicks").where("status", "==", "available").get(),
    ]);
    const rosterSnapshot = rosterSnap.docs.map((d) => ({id: d.id, name: d.data().name, teamName: d.data().teamName}));
    const picksSnapshot = picksSnap.docs.map((d) => ({
      id: d.id, season: d.data().season, round: d.data().round, currentTeamName: d.data().currentTeamName,
    }));

    const result = resolveGroupMeTrade({text, senderTeam, rosterSnapshot, picksSnapshot});

    if (!result.triggered) {
      res.status(200).json({ok: true, status: "ignored", reason: "not a trade confirmation"});
      return;
    }

    if (!result.ok) {
      const problems = result.problems ?? [{reason: result.reason}];
      await ingestRef.set({
        source: "groupme",
        status: "needs_review",
        messageId, senderId, senderName, rawText: text,
        teamA: result.teamA ?? null,
        teamB: result.teamB ?? null,
        moves: result.moves ?? [],
        problems,
        receivedAt: Timestamp.now(),
      });
      await sendGroupMeDM(
        COMMISSIONER_TEAM_NAME,
        `⚠️ GroupMe trade announcement needs review:\n"${text}"\n` +
        problems.map((p) => `• ${p.reason}`).join("\n") +
        `\nResolve it from Admin → Trades: ${APP_URL}`,
      ).catch(() => {});
      res.status(200).json({ok: true, status: "needs_review"});
      return;
    }

    // Clean parse — but this NEVER auto-applies (see doc comment above).
    // Check for a merge target first so a second message about the same
    // deal (or a deal ESPN already applied) doesn't spawn a duplicate.
    const pairKey = teamPairKey(result.teamA, result.teamB);
    const [recentApplied, recentPending] = await Promise.all([
      findRecentAppliedTradeForPair(pairKey),
      findRecentPendingForPair(pairKey),
    ]);

    if (recentPending) {
      const existingIds = new Set((recentPending.moves ?? []).map((m) => m.assetId));
      const newMoves = result.moves.filter((m) => !existingIds.has(m.assetId));
      await db.collection("tradeIngests").doc(recentPending.id).update({
        moves: [...(recentPending.moves ?? []), ...newMoves],
        sourceMessages: FieldValue.arrayUnion({messageId, senderName, text}),
      });
      res.status(200).json({ok: true, status: "merged", mergedInto: recentPending.id});
      return;
    }

    await ingestRef.set({
      source: "groupme",
      status: "pending_confirmation",
      teamA: result.teamA,
      teamB: result.teamB,
      teamPairKey: pairKey,
      moves: result.moves,
      attachToTradeId: recentApplied?.tradeId ?? null,
      messageId, senderId, senderName, rawText: text,
      sourceMessages: [{messageId, senderName, text}],
      receivedAt: Timestamp.now(),
    });
    await sendGroupMeDM(
      COMMISSIONER_TEAM_NAME,
      `🔔 GroupMe trade detected — ${result.teamA} ↔ ${result.teamB}:\n"${text}"\n` +
      `Confirm it from Admin → Trades: ${APP_URL}`,
    ).catch(() => {});

    res.status(200).json({ok: true, status: "pending_confirmation", tradeIngestId: ingestId});
  },
);

/**
 * Commissioner taps "Confirm & Apply" on a GroupMe-sourced pending trade
 * (Admin → Trades). Two shapes, both requiring exactly this one tap:
 *   - attachToTradeId set: an ESPN email already applied this trade's
 *     player legs — this just adds the extra assets (picks, almost
 *     always) onto that existing trade doc.
 *   - otherwise: a brand-new trade, applied exactly like the ESPN clean
 *     path (transfer assets, create the trade doc, log the ledger).
 */
exports.confirmPendingTrade = onCall(
  {secrets: [GROUPME_TOKEN]},
  async (request) => {
    const email = request.auth?.token?.email;
    if (!email) throw new HttpsError("unauthenticated", "Sign in first.");
    const leagueConfig = await db.doc("config/league").get();
    const authorized = leagueConfig.data()?.authorizedUIDs ?? [];
    const isCommissioner = email === COMMISSIONER_EMAIL || authorized.includes(request.auth.uid);
    if (!isCommissioner) throw new HttpsError("permission-denied", "Commissioner only.");

    const ingestId = request.data?.ingestId;
    if (!ingestId) throw new HttpsError("invalid-argument", "ingestId is required.");

    const ingestRef = db.collection("tradeIngests").doc(ingestId);
    const snap = await ingestRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "No such pending trade.");
    const pending = snap.data();
    if (pending.status !== "pending_confirmation") {
      throw new HttpsError("failed-precondition", `Already ${pending.status}.`);
    }

    const season = leagueConfig.data()?.activeSeasonYear ?? null;
    const toRef = (m) => ({assetType: m.assetType, assetId: m.assetId, displayName: m.displayName, teamName: m.toTeam});
    const transferMove = (tx, m, tradeId) => {
      const col = m.assetType === "player" ? "players" : "draftPicks";
      const field = m.assetType === "player" ? "teamName" : "currentTeamName";
      tx.update(db.collection(col).doc(m.assetId), {[field]: m.toTeam});
      tx.set(db.collection("transactions").doc(), {
        type: "trade",
        season,
        teamName: m.toTeam,
        fromTeam: m.fromTeam,
        playerId: m.assetType === "player" ? m.assetId : null,
        playerName: m.displayName,
        assetType: m.assetType,
        relatedTradeId: tradeId,
        note: "Confirmed from GroupMe",
        actorUid: request.auth.uid,
        createdAt: Timestamp.now(),
      });
    };

    if (pending.attachToTradeId) {
      const tradeRef = db.collection("trades").doc(pending.attachToTradeId);
      await db.runTransaction(async (tx) => {
        const tradeSnap = await tx.get(tradeRef);
        if (!tradeSnap.exists) throw new HttpsError("not-found", "Linked trade no longer exists.");
        const trade = tradeSnap.data();
        const proposerAdds = pending.moves.filter((m) => m.fromTeam === trade.proposingTeamName).map(toRef);
        const receiverAdds = pending.moves.filter((m) => m.fromTeam !== trade.proposingTeamName).map(toRef);
        for (const m of pending.moves) transferMove(tx, m, tradeRef.id);
        tx.update(tradeRef, {
          assetsFromProposer: [...(trade.assetsFromProposer ?? []), ...proposerAdds],
          assetsFromReceiver: [...(trade.assetsFromReceiver ?? []), ...receiverAdds],
        });
        tx.update(ingestRef, {status: "applied", tradeId: tradeRef.id, confirmedAt: Timestamp.now(), confirmedBy: request.auth.uid});
      });
      const trade = (await tradeRef.get()).data();
      const summary = pending.moves.map((m) => m.displayName).join(", ");
      await sendGroupMeDM(trade.proposingTeamName, `➕ ${summary} added to your trade with ${trade.receivingTeamName}.`).catch(() => {});
      await sendGroupMeDM(trade.receivingTeamName, `➕ ${summary} added to your trade with ${trade.proposingTeamName}.`).catch(() => {});
      return {ok: true, tradeId: tradeRef.id, attached: true};
    }

    const tradeRef = db.collection("trades").doc();
    const assetsFromProposer = pending.moves.filter((m) => m.fromTeam === pending.teamA).map(toRef);
    const assetsFromReceiver = pending.moves.filter((m) => m.fromTeam !== pending.teamA).map(toRef);

    await db.runTransaction(async (tx) => {
      for (const m of pending.moves) transferMove(tx, m, tradeRef.id);
      tx.set(tradeRef, {
        proposingTeamName: pending.teamA,
        receivingTeamName: pending.teamB,
        assetsFromProposer,
        assetsFromReceiver,
        notes: null,
        season,
        status: "completed",
        source: "groupme",
        date: Timestamp.now(),
        completedAt: Timestamp.now(),
      });
      tx.update(ingestRef, {status: "applied", tradeId: tradeRef.id, confirmedAt: Timestamp.now(), confirmedBy: request.auth.uid});
    });

    return {ok: true, tradeId: tradeRef.id, attached: false};
  },
);

/**
 * Auto-link: match the caller's VERIFIED Google email against
 * config/league.teamEmailMap and write their uid into userTeamMap.
 * Server-side so nobody can claim a team their email doesn't own.
 * Returns { team } or { team: null } when no mapping exists.
 */
exports.claimTeam = onCall(async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email?.toLowerCase();
  if (!uid || !email) throw new HttpsError("unauthenticated", "Sign in first.");

  const configRef = db.doc("config/league");
  const snap = await configRef.get();
  const config = snap.data() ?? {};

  // Already assigned → return as-is (never reassign silently)
  const existing = config.userTeamMap?.[uid];
  if (existing) return {team: existing};

  // Case-insensitive email match
  const emailMap = config.teamEmailMap ?? {};
  const matchKey = Object.keys(emailMap).find((k) => k.toLowerCase() === email);
  if (!matchKey) return {team: null};

  const team = emailMap[matchKey];
  await configRef.update({[`userTeamMap.${uid}`]: team});
  console.log(`claimTeam: linked ${email} (${uid}) → ${team}`);
  return {team};
});

/**
 * Commissioner-only callable: list the GroupMe groups (and their members)
 * visible to the token owner. Powers the Admin → GroupMe mapping UI so
 * member IDs never have to be hunted down by hand.
 */
exports.groupmeDirectory = onCall(
  {secrets: [GROUPME_TOKEN]},
  async (request) => {
    const email = request.auth?.token?.email;
    if (!email) throw new HttpsError("unauthenticated", "Sign in first.");

    const config = await db.doc("config/league").get();
    const authorized = config.data()?.authorizedUIDs ?? [];
    const isCommissioner = email === COMMISSIONER_EMAIL || authorized.includes(request.auth.uid);
    if (!isCommissioner) throw new HttpsError("permission-denied", "Commissioner only.");

    const token = GROUPME_TOKEN.value();
    if (!token) throw new HttpsError("failed-precondition", "GROUPME_TOKEN secret is not set.");

    const res = await fetch(`https://api.groupme.com/v3/groups?token=${token}&per_page=50`);
    if (!res.ok) throw new HttpsError("internal", `GroupMe API error: HTTP ${res.status}`);
    const json = await res.json();

    return {
      groups: (json.response ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        members: (g.members ?? []).map((m) => ({
          userId: m.user_id,
          nickname: m.nickname,
        })),
      })),
    };
  },
);
