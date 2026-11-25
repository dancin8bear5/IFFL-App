const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {validatePayload, matchPlayers, pickSides} = require("./tradeIngest");
const {buildSignalGroups} = require("./groupmeParser");
const {reconcile} = require("./tradeReconcile");
const {parseEspnTradeEmail, classifyEspnEmail, looksTradeRelated} = require("./espnEmailParser");
const gmailWatch = require("./gmailWatch");
const {runFeedSync} = require("./ifflFeedSync");
const {parseScoreboard, parseStandings, currentWeek, inGameWindow, LIVE_SCORES_PAUSED} = require("./espnScores");
const {gamesFromMatchupRows, newWeekLanded} = require("./weeklyRecap");
const notes = require("./leagueNotes");
const feed = require("./leagueFeed");
const recordWatch = require("./recordWatch");
const watchdog = require("./watchdog");
const pollerHealth = require("./pollerHealth");
const CALENDAR = require("./calendar.json");

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
// Native Gmail watcher (replaces Make.com scenario 4432877). Reuses the
// existing web OAuth client; GMAIL_REFRESH_TOKEN is minted via a one-time
// consent (see functions/scripts/mint-gmail-token.js).
const GMAIL_OAUTH_CLIENT_ID = defineSecret("GMAIL_OAUTH_CLIENT_ID");
const GMAIL_OAUTH_CLIENT_SECRET = defineSecret("GMAIL_OAUTH_CLIENT_SECRET");
const GMAIL_REFRESH_TOKEN = defineSecret("GMAIL_REFRESH_TOKEN");
// Jason's league data feed base URL — unguessable path is the only guard,
// so it lives as a secret, never in git.
const IFFL_FEED_URL = defineSecret("IFFL_FEED_URL");
// Agent #3 recap drafting. Must exist before deploy:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const ESPN_TRADE_LABEL = "espn-trade";
// Mirrors web/src/data/staticData.js ESPN_LEAGUE_ID — the two runtimes
// share no module, the same way ESPN_TEAM_MAP is duplicated in tradeIngest.
const ESPN_LEAGUE_ID = "331652";

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

/**
 * Delivery mode, from config/groupme (Admin → GroupMe):
 *
 *   "all"          — normal: every DM goes to the team it names.
 *   "commissioner" — every DM is REDIRECTED to the commissioner, tagged with
 *                    who it was meant for. Nobody else hears anything. This
 *                    is the rollout setting: the pipeline can run for real
 *                    while only one person is on the receiving end.
 *   "paused"       — nothing is sent to anyone.
 *
 * Falls back to the older `paused` boolean so an un-migrated config keeps
 * behaving exactly as it did.
 */
function groupMeMode(cfg) {
  if (cfg.mode === "all" || cfg.mode === "commissioner" || cfg.mode === "paused") return cfg.mode;
  return cfg.paused ? "paused" : "all";
}

async function sendGroupMeDM(teamName, text) {
  const token = GROUPME_TOKEN.value();
  if (!token) return;
  const cfgSnap = await db.doc("config/groupme").get();
  const cfg = cfgSnap.data() ?? {};

  const mode = groupMeMode(cfg);
  if (mode === "paused") {
    console.log(`GroupMe: paused — skipping DM to ${teamName}`);
    return;
  }

  let target = teamName;
  if (mode === "commissioner" && teamName !== COMMISSIONER_TEAM_NAME) {
    // Redirected, not dropped: the commissioner sees the league's whole
    // notification traffic during rollout, and the tag says who each one
    // would have gone to.
    text = `[would have gone to ${teamName}]\n${text}`;
    target = COMMISSIONER_TEAM_NAME;
    console.log(`GroupMe: commissioner-only — redirecting ${teamName}'s DM`);
  }

  const recipientId = cfg.userMap?.[target] ?? null;
  if (!recipientId) {
    console.log(`GroupMe: no mapping for team ${target} — skipping DM`);
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
    : "";
  // Completed-trade GroupMe DMs removed per commissioner request — the
  // execution is already visible in the app and (for ESPN deals) in the
  // group chat itself; the "it's official" DM to both teams was noise.
  // iOS push kept: it's an app notification, not a chat DM.
  await sendPush(proposer, "Trade Executed", `Your trade with ${receiver} has been completed${tag}.`);
  await sendPush(receiver, "Trade Executed", `Your trade with ${proposer} has been completed${tag}.`);
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
 * Undo a completed trade — every asset goes back to the side that sent it.
 *
 * ESPN can void a trade after the fact, and a trade this app applied from an
 * ESPN email has to be undoable the same way it was applied. Reversal is a
 * mirror of executeTradeAssets: the side arrays say what each team SENT, so
 * sending them back is the whole operation.
 *
 * Guarded on status like executeTradeAssets, so a redelivered event cannot
 * reverse twice and hand everyone back the wrong roster. Sets 'reversed'
 * rather than deleting, so the trade and its undo both stay on the record.
 */
async function reverseTradeAssets(tradeId, reason) {
  return db.runTransaction(async (tx) => {
    const tradeRef = db.collection("trades").doc(tradeId);
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return {ok: false, error: "trade not found"};
    const trade = snap.data();
    // 'reverseRequested' is how the web app asks for this — it can only flip
    // status, not move assets. Both it and a direct server-side call on a
    // completed trade are valid starting points; anything else (already
    // reversed, still proposed) is refused so a redelivered event cannot
    // hand everyone back the wrong roster.
    if (trade.status !== "completed" && trade.status !== "reverseRequested") {
      return {ok: false, error: `trade is '${trade.status}', not completed`};
    }

    const giveBack = (assetRef, backTo, from) => {
      if (!assetRef.assetId) return; // historical entries carry no live id
      const col = assetRef.assetType === "player" ? "players" : "draftPicks";
      const field = assetRef.assetType === "player" ? "teamName" : "currentTeamName";
      tx.update(db.collection(col).doc(assetRef.assetId), {[field]: backTo});
      tx.set(db.collection("transactions").doc(), {
        type: "trade",
        season: trade.season ?? null,
        teamName: backTo,
        fromTeam: from,
        playerId: assetRef.assetId,
        playerName: assetRef.displayName ?? null,
        assetType: assetRef.assetType,
        relatedTradeId: tradeId,
        note: `Trade reversed${reason ? ` — ${reason}` : ""}`,
        actorUid: null,
        createdAt: admin.firestore.Timestamp.now(),
      });
    };

    // What the proposer sent goes back to the proposer, and vice versa.
    for (const ref of trade.assetsFromProposer ?? []) {
      giveBack(ref, trade.proposingTeamName, trade.receivingTeamName);
    }
    for (const ref of trade.assetsFromReceiver ?? []) {
      giveBack(ref, trade.receivingTeamName, trade.proposingTeamName);
    }

    tx.update(tradeRef, {
      status: "reversed",
      reversedAt: admin.firestore.Timestamp.now(),
      reverseReason: reason ?? null,
    });
    return {ok: true, teams: [trade.proposingTeamName, trade.receivingTeamName]};
  });
}

/**
 * Fires on every write to the trades collection.
 * Sends FCM push (iOS) + GroupMe DM to the relevant team(s).
 */
/**
 * The onTradeWrite body, extracted so the offline pipeline harness can
 * drive it directly (functions/pipeline.test.js). The wrapped trigger
 * below is the only production entry point; this is the same code.
 */
async function handleTradeWrite(event) {
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
      await publishTradeFeed(event.params?.tradeId, after);
      return null;
    }
    // Backfilled and imported records (keeper sheet, feed adoption) are not
    // offers — nobody should be told they "received a trade offer" from a
    // deal that happened months ago. Only a genuinely proposed trade
    // notifies below. This gating was missing: a created 'historical' doc
    // used to fall through to the offer DMs, masked only by GroupMe being
    // paused during every backfill so far.
    if (after.status !== "proposed" && !after.parentTradeId) return null;

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

  // No status change — nothing to notify. But a completed trade whose assets
  // changed (a pick filled in by the next feed poll, or attached in Admin)
  // gets its write-up rewritten: the post must describe the whole trade.
  if (before.status === after.status) {
    if (after.status === "completed" && feed.tradeChanged(before, after)) {
      await publishTradeFeed(event.params?.tradeId, after);
    }
    return null;
  }

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

    case "reverseRequested":
      // The web app can only flip status — members have no write access to
      // players or draftPicks. Doing the moves here mirrors how an accept is
      // executed, and the resulting write to 'reversed' re-triggers this
      // function so the case below sends the notifications.
      try {
        const r = await reverseTradeAssets(event.params.tradeId, after.reverseReason);
        if (!r.ok) console.error(`Reverse ${event.params.tradeId} refused: ${r.error}`);
      } catch (err) {
        console.error(`Reverse ${event.params.tradeId} failed:`, err);
      }
      break;

    case "reversed": {
      const why = after.reverseReason ? ` — ${after.reverseReason}` : "";
      for (const team of [proposer, receiver]) {
        await sendPush(team, "Trade Reversed",
          `The ${proposer} ↔ ${receiver} trade has been undone${why}`);
        await sendGroupMeDM(
          team,
          `↩️ The ${proposer} ↔ ${receiver} trade was REVERSED${why}. ` +
          `Every player and pick has gone back: ${APP_URL}`,
        );
      }
      break;
    }

    case "cancelled": {
      // Commissioner pulled a pending offer. Both sides are told, because
      // the trade simply vanishes from their lists otherwise and the
      // receiver in particular would just see their inbox badge clear.
      const why = after.cancelReason ? ` — "${after.cancelReason}"` : "";
      await sendPush(proposer, "Trade Cancelled",
        `The commissioner cancelled your offer to ${receiver}${why}`);
      await sendPush(receiver, "Trade Cancelled",
        `The commissioner cancelled ${proposer}'s offer to you${why}`);
      for (const team of [proposer, receiver]) {
        await sendGroupMeDM(
          team,
          `🚫 The commissioner cancelled the ${proposer} ↔ ${receiver} trade offer${why}. ` +
          `Nothing moved: ${APP_URL}`,
        );
      }
      break;
    }

    case "completed":
      await notifyCompleted(proposer, receiver, youGet, theyGet, after.source);
      await publishTradeFeed(event.params?.tradeId, after);
      break;

    default:
      break;
  }

  return null;
}

exports.onTradeWrite = onDocumentWritten(
  {document: "trades/{tradeId}", secrets: [GROUPME_TOKEN, ANTHROPIC_API_KEY]},
  handleTradeWrite,
);

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
/**
 * SHARED CORE — process one ESPN trade, regardless of source (HTTP webhook
 * or the native Gmail poller). Takes already-validated moves and applies the
 * full pipeline: dedupe → roster match → Plan B reconcile → apply or hold.
 * Returns { status, ...detail } — never throws for business outcomes, only
 * for genuine infra errors. Callers translate the result into HTTP / logs.
 *
 * `sourceLabel` tags the ledger + heartbeat ("espn-email" webhook vs
 * "espn-gmail" native poll) so we can tell which pipe recorded a trade.
 */
async function processEspnTrade({sourceId, tradeDate, rawText, moves, sourceLabel = "espn-email"}) {
  // Step 1: verify — have we already seen this exact source event?
  const ingestRef = db.collection("tradeIngests").doc(sourceId);
  const existing = await ingestRef.get();
  if (existing.exists) {
    return {status: "duplicate", previousStatus: existing.data().status};
  }

  // Live roster snapshot for the teams this trade touches.
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
      source: sourceLabel,
      moves,
      problems: match.problems,
      tradeDateRaw: tradeDate ?? null,
      rawText: rawText ?? null,
      receivedAt: admin.firestore.Timestamp.now(),
    });
    await sendGroupMeDM(
      COMMISSIONER_TEAM_NAME,
      `⚠️ ESPN trade auto-import needs review:\n` +
      match.problems.map((p) => `• ${p.reason}`).join("\n") +
      `\nResolve it from Admin → Trades: ${APP_URL}`,
    ).catch(() => {});
    return {status: "needs_review", problems: match.problems};
  }

  // Step 2a.5: PLAN B reconciliation. Even when every ESPN player leg
  // resolves, cross-check against recent GroupMe signals. If the chat shows
  // a draft pick (which ESPN emails NEVER contain) or the teams disagree,
  // HOLD THE WHOLE TRADE for review instead of auto-applying and silently
  // dropping the pick — the exact 2026-08-16 trap (Dak/Turpin + lost 2027 2nd).
  const espnTeamsInvolved = [...new Set(moves.flatMap((m) => [m.fromTeam, m.toTeam]))];
  let gmExtract = null;
  try {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 48 * 3600 * 1000);
    const sigSnap = await db.collection("groupmeTradeSignals")
      .where("capturedAt", ">=", since)
      .get();
    for (const d of sigSnap.docs) {
      const s = d.data();
      const sTeams = s.teams || [];
      const namesTrade = sTeams.some((t) => espnTeamsInvolved.includes(t));
      const hasPick = !!s.hasPick;
      if (namesTrade || hasPick) {
        const picks = (s.picks || []).map((p) => ({year: p.year ?? null, round: p.round, raw: p.raw}));
        gmExtract = {picks, teams: sTeams, directionPhrases: s.directionPhrases || [], signalId: d.id};
        if (picks.length > 0) break; // a pick signal is the strongest match
      }
    }
  } catch (e) {
    console.error("processEspnTrade: GroupMe cross-check failed (non-fatal):", e.message);
  }

  const recon = reconcile({ok: true, moves, meta: {}}, gmExtract);

  // An ESPN email IS the confirmation that a trade happened — there is no
  // second source to wait on, so a clean parse applies. Only a genuine
  // DISAGREEMENT between the two sources stops it: if GroupMe names teams
  // the email doesn't, one of them is describing a different deal and
  // guessing which would be worse than waiting.
  //
  // A pick no longer holds the trade. It cannot be verified against ESPN
  // either way (emails never carry picks), so holding the players hostage to
  // it bought nothing; the players apply and the pick becomes its own item
  // in the review queue, which Admin → Trades → "Fix a recorded trade"
  // attaches to the trade that just landed.
  //
  // Missing GroupMe chatter is no longer a reason for anything.
  const blocked = recon.flags.teamMismatch || recon.flags.extraTeams;
  if (blocked) {
    await ingestRef.set({
      sourceId,
      status: "needs_review",
      source: sourceLabel,
      moves,
      reconcileDecision: recon.decision,
      reconcileReasons: recon.reasons,
      groupmePicks: recon.picks,
      groupmeSignalId: gmExtract?.signalId ?? null,
      tradeDateRaw: tradeDate ?? null,
      rawText: rawText ?? null,
      receivedAt: admin.firestore.Timestamp.now(),
    });
    await sendGroupMeDM(
      COMMISSIONER_TEAM_NAME,
      `⚠️ ESPN trade held — the email and the group chat disagree:\n` +
      recon.reasons.map((r) => `• ${r}`).join("\n") +
      `\nResolve it from Admin → Trades: ${APP_URL}`,
    ).catch(() => {});
    return {status: "needs_review", decision: recon.decision, reasons: recon.reasons};
  }

  // Step 2b: every leg resolved AND reconciliation clean — apply it.
  const configSnap = await db.doc("config/league").get();
  const season = configSnap.data()?.activeSeasonYear ?? null;
  const {proposingTeamName, receivingTeamName} = pickSides(match.resolved);
  const tradeRef = db.collection("trades").doc();

  // When the trade actually happened, if we know it. The Gmail poller passes
  // the email's arrival time; the webhook passes whatever the caller sent.
  // Anything unusable falls back to now() rather than guessing.
  const parsedDate = tradeDate ? new Date(tradeDate) : null;
  const when = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? admin.firestore.Timestamp.fromDate(parsedDate)
    : admin.firestore.Timestamp.now();

  const toRef = (m) => ({assetType: "player", assetId: m.assetId, displayName: m.displayName, teamName: m.toTeam});
  const assetsFromProposer = match.resolved.filter((m) => m.fromTeam === proposingTeamName).map(toRef);
  const assetsFromReceiver = match.resolved.filter((m) => m.fromTeam !== proposingTeamName).map(toRef);

  await db.runTransaction(async (tx) => {
    for (const m of match.resolved) {
      tx.update(db.collection("players").doc(m.assetId), {
        teamName: m.toTeam,
        tradeHistory: admin.firestore.FieldValue.arrayUnion(`via ${m.fromTeam} (ESPN)`),
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
        createdAt: admin.firestore.Timestamp.now(),
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
      source: sourceLabel,
      // The chat mentioned a pick ESPN can't show us. Written in the SAME
      // transaction, so the write-up's trigger can never run before it.
      ...(recon.flags.picks && recon.picks.length > 0 ? {picksPending: true} : {}),
      date: when,
      completedAt: admin.firestore.Timestamp.now(),
    });
    tx.set(ingestRef, {
      sourceId,
      status: "applied",
      source: sourceLabel,
      tradeId: tradeRef.id,
      moves: match.resolved,
      tradeDateRaw: tradeDate ?? null,
      rawText: rawText ?? null,
      receivedAt: admin.firestore.Timestamp.now(),
    });
  });

  // A pick GroupMe mentioned rode along with this deal and ESPN could not
  // tell us about it. The players are applied; the pick becomes its own
  // review item pointing at the trade that just landed, so it is attached
  // rather than lost. Written after the transaction so a failure here can
  // never roll back a good trade.
  if (recon.flags.picks && recon.picks.length > 0) {
    const desc = recon.picks.map((p) => `${p.year ?? "?"} R${p.round}`).join(", ");
    await db.collection("tradeIngests").doc(`${sourceId}__picks`).set({
      sourceId: `${sourceId}__picks`,
      status: "needs_review",
      source: sourceLabel,
      kind: "unattached_pick",
      attachToTradeId: tradeRef.id,
      teams: [proposingTeamName, receivingTeamName],
      groupmePicks: recon.picks,
      groupmeSignalId: gmExtract?.signalId ?? null,
      reconcileReasons: [
        `Players applied. GroupMe also mentioned ${desc}, which an ESPN email can never ` +
        `contain — add it from Admin → Trades → "Fix a recorded trade".`,
      ],
      receivedAt: admin.firestore.Timestamp.now(),
    }).catch((e) => console.error("pick to-do write failed:", e.message));

    await sendGroupMeDM(
      COMMISSIONER_TEAM_NAME,
      `📋 ${proposingTeamName} ↔ ${receivingTeamName} applied, but the chat mentioned ${desc}. ` +
      `ESPN never sends picks — add it in Admin → Trades: ${APP_URL}`,
    ).catch(() => {});
  }

  return {status: "applied", tradeId: tradeRef.id, pickToDo: recon.flags.picks};
}

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

    // HEARTBEAT: record that the webhook path reached us.
    db.doc("config/espnIngest").set({
      lastIngestAt: admin.firestore.Timestamp.now(),
      lastIngestSource: "webhook",
    }, {merge: true}).catch(() => {});

    const validation = validatePayload(req.body);
    if (!validation.ok) {
      res.status(400).json({ok: false, error: validation.error});
      return;
    }
    const {sourceId, tradeDate, rawText} = req.body;
    try {
      const result = await processEspnTrade({
        sourceId, tradeDate, rawText, moves: validation.moves, sourceLabel: "espn-email",
      });
      res.status(200).json({ok: true, ...result});
    } catch (e) {
      console.error("ingestEspnTrade: processing error:", e);
      res.status(500).json({ok: false, error: e.message});
    }
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

// ── GroupMe trade-signal poller ────────────────────────────────
// GroupMe is the ONLY record of the pick legs + full agreed terms of a
// trade — ESPN's tool can't express draft-pick trades, so they're
// announced in the group chat (usually flagged with 🚨). This poller
// captures every message that looks like trade chatter into the
// groupmeTradeSignals collection as an UNREVIEWED signal. It never
// auto-parses picks or transfers assets — league shorthand ("27 1st"),
// jokes, and backouts ("I BACKED OUT") make that unsafe. The signals are
// a review inbox in Admin → Trade Signals, where the commissioner pairs
// them with the ESPN-imported player legs and records the picks by hand.
//
// Runs hourly via Cloud Scheduler. State (last processed message id)
// lives in config/groupmePoller so each run only fetches what's new.

const GROUPME_GROUP_ID = "15079499";

// The 🚨 siren is the league's near-universal trade flag (~99% of deals).
// Keywords are the backup net for the rare unflagged announcement.
const TRADE_SIGNAL_EMOJI = ["\uD83D\uDEA8"]; // 🚨
const TRADE_SIGNAL_KEYWORDS = [
  "trade", "trading", "traded",
  "offer", "offering",
  "propose", "proposal", "proposing",
  "deal", "swap", "veto",
  "accepted", "in exchange", "for your",
];

/**
 * Decide whether a GroupMe message looks like trade chatter and, if so,
 * why. Returns {hit, reasons[]} — reasons are stored on the signal so
 * the review UI can show what tripped the filter. System messages
 * (member added/removed, name changes, etc.) are always ignored.
 */
function classifyTradeSignal(msg) {
  if (!msg || msg.system) return {hit: false, reasons: []};
  const text = String(msg.text ?? "");
  if (!text.trim()) return {hit: false, reasons: []};
  const reasons = [];
  for (const emoji of TRADE_SIGNAL_EMOJI) {
    if (text.includes(emoji)) reasons.push("emoji:\uD83D\uDEA8");
  }
  const lower = text.toLowerCase();
  for (const kw of TRADE_SIGNAL_KEYWORDS) {
    if (lower.includes(kw)) reasons.push(`keyword:${kw}`);
  }
  return {hit: reasons.length > 0, reasons};
}

/**
 * Fetch GroupMe messages newer than afterId, oldest-first, paginating
 * past the 100-per-call cap. GroupMe's /messages endpoint returns
 * newest-first and takes `after_id` (strictly newer than the given id,
 * ascending) — we page with after_id and stop when a page is empty.
 * Guards against runaway loops with a hard page cap.
 */
async function fetchGroupMeMessagesSince(token, afterId) {
  const collected = [];
  let cursor = afterId;
  const MAX_PAGES = 50; // 50 * 100 = 5000 msgs/run ceiling — safety valve
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://api.groupme.com/v3/groups/${GROUPME_GROUP_ID}/messages`);
    url.searchParams.set("token", token);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after_id", cursor);
    const res = await fetch(url.toString());
    // 304 = no newer messages; treat as done.
    if (res.status === 304) break;
    if (!res.ok) {
      throw new Error(`GroupMe messages fetch failed: HTTP ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    const batch = json.response?.messages ?? [];
    if (batch.length === 0) break;
    // after_id returns ascending (oldest-first) — keep order, advance cursor.
    collected.push(...batch);
    cursor = batch[batch.length - 1].id;
    if (batch.length < 100) break; // last page
  }
  return collected;
}

/**
 * Jason's league feed — the upstream source of truth for rosters, contract
 * prices, picks, and trades. Phase 3: REPORT ONLY — every changed snapshot
 * becomes a diff report (config/ifflFeedReport) and a commissioner DM;
 * nothing is applied. The engine and its tests live in ifflFeedSync.js.
 */
/**
 * Live scoreboard from ESPN's public v3 API — the same endpoint their own
 * site calls. No key, no cookies, no scraping.
 *
 * Writes to espnLiveScores/{season}, which is DELIBERATELY not the
 * weeklyScores collection the league's charts read: this is on trial, and a
 * separate collection means test mode cannot leak into anyone's Dashboard.
 * Visibility is a separate decision (config/league.liveScores), and the
 * write happens either way so there is real data to look at before it ships.
 *
 * Polls every 5 minutes but returns immediately outside the window the
 * commissioner set — all day Sunday and Monday 7pm–midnight Central. See
 * inGameWindow in espnScores.js, which also records what that gives up.
 */
/**
 * NOT DEPLOYED WHILE PAUSED — the flag gates the EXPORT, not just the body.
 *
 * Returning early inside the handler stopped the ESPN calls and the writes,
 * but the function still existed, so Cloud Scheduler still held a job for it
 * and still fired it every 5 minutes: 8,640 invocations a month to run one
 * `return`, plus $0.10/month for the job itself (only 3 scheduler jobs are
 * free per billing account). Not exporting it means the next deploy removes
 * the function AND its scheduler job, which is the only way the schedule
 * actually costs nothing.
 *
 * Resuming is still one flag and a deploy: set LIVE_SCORES_PAUSED to false
 * in espnScores.js and merge. The deploy recreates the function and its
 * 5-minute job, and `pollerHealth` starts expecting a write in the window
 * again — it reads the SAME constant, which is what keeps the two halves
 * from disagreeing. Never pause one without the other: a health check that
 * expects writes from a function that is not deployed fails every Sunday,
 * and fails the deploy with it.
 *
 * One-time cleanup when flipping this ON: the function is already deployed,
 * and `firebase deploy --non-interactive` does not delete functions that
 * have vanished from source. Run `firebase functions:delete pollEspnScores`
 * once to remove it and its job.
 */
if (!LIVE_SCORES_PAUSED) exports.pollEspnScores = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Chicago", retryCount: 0},
  async () => {
    const cfgSnap = await db.doc("config/league").get();
    const season = cfgSnap.data()?.activeSeasonYear ?? new Date().getFullYear();
    const stateRef = db.doc(`espnLiveScores/${season}`);

    // `force` lets the commissioner pull a scoreboard out of window while
    // evaluating this — otherwise there would be nothing to look at until
    // kickoff. Set it by hand on espnLiveScores/{season}; no screen writes it.
    const force = (await stateRef.get()).data()?.forcePoll === true;
    if (!force && !inGameWindow(new Date())) return;

    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
      `/segments/0/leagues/${ESPN_LEAGUE_ID}?view=mMatchupScore`;
    let data;
    try {
      const res = await fetch(url, {headers: {"User-Agent": "iffl-app/1.0"}});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      console.error("pollEspnScores: fetch failed:", e.message);
      await stateRef.set({lastError: e.message, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true});
      return;
    }

    const board = parseScoreboard(data, currentWeek(data));
    await stateRef.set({
      season,
      week: board.week,
      games: board.games,
      problems: board.problems,
      lastError: null,
      lastRunAt: admin.firestore.Timestamp.now(),
    }, {merge: true});
    console.log(`pollEspnScores: week ${board.week}, ${board.games.length} games, ${board.problems.length} problems`);
  },
);

/**
 * Current-season standings from ESPN's public v3 API (?view=mTeam) — same
 * endpoint family as pollEspnScores, no key, no cookies.
 *
 * Writes espnStandings/{season}. The Dashboard's Standings section reads it
 * in-season, and only for activeSeason — past seasons live in League
 * History. Hourly is plenty: standings only move when a game goes final,
 * and stat corrections land on Tuesdays.
 */
exports.pollEspnStandings = onSchedule(
  // ANTHROPIC key: this hourly job also carries the League Feed's calendar
  // notices. Riding an existing schedule is deliberate — Cloud Scheduler
  // bills per JOB, and a notice needs no better than hourly.
  {schedule: "every 60 minutes", timeZone: "America/Chicago", retryCount: 0, secrets: [ANTHROPIC_API_KEY, GROUPME_TOKEN]},
  async () => {
    const cfgSnap = await db.doc("config/league").get();
    const season = cfgSnap.data()?.activeSeasonYear ?? new Date().getFullYear();
    // First, and independent of ESPN: a standings outage must not cost the
    // league its trade-deadline notice.
    await publishMilestones(cfgSnap.data() ?? {})
      .catch((e) => console.error("publishMilestones failed:", e.message));
    const ref = db.doc(`espnStandings/${season}`);

    // The poll itself is wrapped so that its early return on a failed fetch
    // still reaches the watchdog below — a standings outage is precisely
    // when the watchdog has something to say.
    await (async () => {
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
      `/segments/0/leagues/${ESPN_LEAGUE_ID}?view=mTeam`;
    let data;
    try {
      const res = await fetch(url, {headers: {"User-Agent": "iffl-app/1.0"}});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      console.error("pollEspnStandings: fetch failed:", e.message);
      await ref.set({lastError: e.message, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true});
      return;
    }

    const {standings, gamesPlayed, problems} = parseStandings(data);
    await ref.set({
      season,
      standings,
      gamesPlayed,
      problems,
      lastError: null,
      lastRunAt: admin.firestore.Timestamp.now(),
    }, {merge: true});
    console.log(`pollEspnStandings: ${standings.length} teams, ${gamesPlayed} games played, ${problems.length} problems`);
    })();

    await runWatchdog(season).catch((e) => console.error("runWatchdog failed:", e.message));
  },
);

/**
 * The hourly health loop (functions/watchdog.js). Reads every job's state
 * doc, and DMs the commissioner only when something BREAKS, RECOVERS, or
 * has been down another full day. Rides pollEspnStandings — no Scheduler
 * job of its own. It cannot watch that job dying outright; the deploy
 * check and the fixer on the Mac cover that side.
 */
async function runWatchdog(season, nowMs = Date.now()) {
  const list = pollerHealth.watchdogChecks(season);
  const docs = {};
  for (const c of list) {
    const snap = await db.doc(c.path).get();
    docs[c.path] = snap.exists ? snap.data() : null;
  }
  const results = pollerHealth.evaluate(docs, new Date(nowMs), season, undefined, list);
  // A note that failed to send sits in Admin → Notes saying nothing.
  const failedNotes = (await db.collection("leagueNotes").where("status", "==", "failed").get()).docs.length;
  results.push(failedNotes
    ? {name: "League notes", ok: false, reason: `${failedNotes} failed to send — Admin → Notes`}
    : {name: "League notes", ok: true, reason: "none failed"});

  const ref = db.doc("config/watchdog");
  const diff = watchdog.diffHealth((await ref.get()).data(), results, nowMs);
  const msg = watchdog.watchdogMessage(diff, nowMs);
  await ref.set({failing: diff.failing, lastRunAt: admin.firestore.Timestamp.now(), lastError: null});
  if (msg) await sendGroupMeDM(COMMISSIONER_TEAM_NAME, msg).catch(() => {});
  return {msg, failing: Object.keys(diff.failing)};
}

/**
 * Agent #2 — weekly scores (docs/agents/02-weekly-dashboard-agent.md).
 *
 * RETIRED AS A POLLER (Nov 2026). pollWeeklyScores used to fetch ESPN every
 * Tuesday and write weeklyScores/{season}. The Mac's Tuesday scrape
 * (web/scripts/scrape-espn-week.mjs) reads the same totals off ESPN, checks
 * them against the scoreboard, and already stored them in historyMatchups —
 * so two jobs were pulling one number. The scrape is now the ONLY writer of
 * weeklyScores/{season} and of the health doc config/weeklyPoller.
 *
 * What is left here is the half that needs secrets and so cannot live on
 * the Mac: when a NEW week lands in the active season's weeklyScores doc,
 * DM the commissioner and draft the week's recap. Games come from
 * historyMatchups/{season} (the scrape writes it BEFORE weeklyScores, in
 * that order, for exactly this reason) and the table from
 * espnStandings/{season}. No ESPN call.
 *
 * Kill switch: 'weeklyAgent' in config/league.disabledAreas silences the DM
 * and the recap. It no longer stops the scores themselves — that job is on
 * the Mac (`launchctl unload ~/Library/LaunchAgents/com.iffl.espn-weekly.plist`).
 *
 * One-time cleanup after the first deploy of this change: `firebase deploy
 * --non-interactive` does not delete functions that vanished from source.
 *   firebase functions:delete pollWeeklyScores pollWeeklyForce --project iffl-auth --force
 * removes both and their two Cloud Scheduler jobs ($0.10/month each).
 */
exports.onWeeklyScoresWritten = onDocumentWritten(
  // 300s: the feed writes one post per game plus the week-in-review, each
  // of which may take two Claude calls. They run in parallel, but the
  // default 60s is too tight for a slow afternoon at the API.
  {document: "weeklyScores/{season}", secrets: [GROUPME_TOKEN, ANTHROPIC_API_KEY], retry: false, timeoutSeconds: 300},
  async (event) => {
    const season = Number(event.params.season);
    const cfg = (await db.doc("config/league").get()).data() ?? {};
    const week = newWeekLanded({
      season,
      activeSeason: cfg.activeSeasonYear ?? new Date().getFullYear(),
      beforeWeeks: event.data?.before?.data()?.weeks,
      afterWeeks: event.data?.after?.data()?.weeks,
    });
    if (!week) return;

    const rows = (await db.doc(`historyMatchups/${season}`).get()).data()?.rows ?? [];
    const games = gamesFromMatchupRows(rows, week);
    const standings = (await db.doc(`espnStandings/${season}`).get()).data()?.standings ?? [];

    // The League Feed has its own switch (feedAgent) and publishes with no
    // approval step — it runs whether or not the DM + GroupMe recap do.
    if (games.length) {
      await publishWeekFeed({season, week, games, standings, cfg})
        .catch((e) => console.error("publishWeekFeed failed:", e.message));
      await watchRecords({season, week, cfg})
        .catch((e) => console.error("watchRecords failed:", e.message));
    }

    if ((cfg.disabledAreas ?? []).includes("weeklyAgent")) {
      console.log(`weeklyScores: week ${week} landed; DM + recap disabled via Admin → Areas`);
      return;
    }
    const weeksOnFile = Object.keys(event.data.after.data().weeks ?? {}).length;

    const msg = `📊 Weekly scores: week ${week} written (${weeksOnFile} weeks on file)` +
      (games.length ? "" : `\n⚠️ No games for week ${week} in historyMatchups — recap not drafted.`);
    await sendGroupMeDM(COMMISSIONER_TEAM_NAME, msg).catch(() => {});
    console.log("weeklyScores:", msg);

    if (games.length) {
      await draftRecapNote({season, week, games, standings, cfg})
        .catch((e) => console.error("draftRecapNote failed:", e.message));
    }
  },
);

// ── Agent #3 — league notes (docs/agents/03-league-notes-agent.md) ──
// Drafts only. Nothing reaches the league until Jared approves the body
// AND the send time in Admin → Notes; sendLeagueNotes is the only writer
// of sending/sent (firestore.rules keeps clients out of both).

async function claudeDraft(prompt, model) {
  const key = ANTHROPIC_API_KEY.value();
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    body: JSON.stringify({model, max_tokens: 2000, messages: [{role: "user", content: prompt}]}),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  // A reply cut off at the token limit is half a sentence, and it passes the
  // number check: week 11's Ryan–Jason recap was published as "a 50.7-".
  // Throwing sends writeVerified round again, then to the template.
  if (j.stop_reason === "max_tokens") throw new Error("Claude reply cut off at the token limit");
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim() || null;
}

// ── League Feed (functions/leagueFeed.js) ─────────────────────
// Publishes straight to leagueFeed/{id}; website only, no approval. The
// write → fact-check → rewrite loop and the template fallback live in
// leagueFeed.writeVerified. Kill switch: 'feedAgent' in disabledAreas.
const NOTES_MODEL = "claude-sonnet-5-5";
const feedAgentOn = (cfg) => !(cfg?.disabledAreas ?? []).includes("feedAgent");

async function publishFeedPost({id, type, season, week, title, facts, prompt, template, cfg, once = false, check = null, maxAttempts}) {
  const ref = db.doc(`leagueFeed/${id}`);
  const existing = (await ref.get()).data();
  // Never overwrite a post the commissioner edited or hid.
  if (feed.isLocked(existing)) return {id, skipped: true};
  // `once`: an hourly caller (milestones) must not rewrite — and re-bill —
  // the same post every run.
  if (once && existing) return {id, skipped: true};
  const result = await feed.writeVerified({
    draft: (p) => claudeDraft(p, cfg.notesModel ?? NOTES_MODEL),
    prompt, facts, template, check, ...(maxAttempts ? {maxAttempts} : {}),
  });
  const now = admin.firestore.Timestamp.now();
  await ref.set({
    ...feed.feedPost({type, season, week, title, facts, result, now}),
    publishedAt: existing?.publishedAt ?? now,
  });
  return {id, writer: result.writer, attempts: result.attempts};
}

async function publishWeekFeed({season, week, games, standings, cfg}) {
  if (!feedAgentOn(cfg)) return [];
  const voice = cfg.notesVoice ?? "";
  const ww = String(week).padStart(2, "0");
  const playerRows = (await db.doc(`historyPlayerWeeks/${season}-${ww}`).get()).data()?.rows ?? [];

  const jobs = games.map((game) => {
    const facts = feed.gameFacts({season, week, game, playerRows, standings});
    return publishFeedPost({
      id: feed.feedId.game(season, week, game.home, game.away), type: "game", season, week,
      title: `${facts.winner} ${facts.winnerPoints}, ${facts.loser} ${facts.loserPoints}`,
      facts, prompt: feed.gamePrompt(facts, voice), template: feed.templateGame(facts), cfg,
    });
  });
  const wf = feed.weekFacts({season, week, games, standings});
  jobs.push(publishFeedPost({
    id: feed.feedId.week(season, week), type: "week", season, week,
    title: `Week ${week} in review`,
    facts: wf, prompt: feed.weekPrompt(wf, voice), template: feed.templateWeek(wf), cfg,
  }));
  // One failed post must not sink the other six.
  const settled = await Promise.allSettled(jobs);
  const out = settled.map((s) => (s.status === "fulfilled" ? s.value : {error: s.reason?.message}));
  console.log("leagueFeed week", week, JSON.stringify(out));
  return out;
}

/**
 * Did the week that just landed take a single-game record? If so the
 * Trophy Room card is updated here (it used to wait for a manual Admin →
 * Records edit or a re-import) and the feed says so. The card update is
 * data, so it is NOT behind the feedAgent switch; the post is.
 */
async function watchRecords({season, week, cfg}) {
  const snap = await db.collection("historyMatchups").get();
  const games = recordWatch.gamesFromMatchupDocs(snap.docs.map((d) => d.data()));
  const owners = recordWatch.ownersOfSeason(games, season);
  const broken = recordWatch.brokenRecords(games, owners, season, week);
  const out = [];
  for (const {card, previous} of broken) {
    const {id, ...fields} = card;
    await db.doc(`leagueRecords/${id}`).set({source: "record-watch", ...fields});
    if (!feedAgentOn(cfg)) { out.push({id, card: "updated"}); continue; }
    const facts = feed.recordFacts({card, previous});
    out.push(await publishFeedPost({
      id: feed.feedId.record(id, season, week), type: "record", season, week,
      title: `New record: ${card.label}`,
      facts, prompt: feed.recordPrompt(facts, cfg.notesVoice ?? ""), template: feed.templateRecord(facts), cfg,
    }));
  }
  if (out.length) console.log("recordWatch week", week, JSON.stringify(out));
  return out;
}

/** Calendar notices. Called hourly; each post is written once (fixed id + `once`). */
async function publishMilestones(cfg, nowMs = Date.now()) {
  if (!feedAgentOn(cfg)) return [];
  const due = feed.milestonesDue(CALENDAR, nowMs);
  const season = cfg.activeSeasonYear ?? new Date(nowMs).getFullYear();
  const out = [];
  for (const facts of due) {
    out.push(await publishFeedPost({
      id: feed.feedId.milestone(facts.name, facts.date, facts.kind), type: "milestone", season, week: null,
      title: facts.kind === "reminder" ? `${facts.daysAway} days: ${facts.name}` : `${facts.icon} ${facts.name}`.trim(),
      facts, prompt: feed.milestonePrompt(facts, cfg.notesVoice ?? ""), template: feed.templateMilestone(facts), cfg,
      once: true,
    }));
  }
  return out;
}

/** A trade just completed → a write-up. Never throws: news must not break a trade. */
async function publishTradeFeed(tradeId, trade) {
  try {
    if (!tradeId || !feed.isFreshTrade(trade, Date.now())) return null;
    // The whole trade or nothing: a pick the chat mentioned is not on it yet.
    if (!feed.tradeIsWhole(trade)) return {id: feed.feedId.trade(tradeId), held: "picksPending"};
    const cfg = (await db.doc("config/league").get()).data() ?? {};
    if (!feedAgentOn(cfg)) return null;
    const season = trade.season ?? cfg.activeSeasonYear ?? new Date().getFullYear();
    const standings = (await db.doc(`espnStandings/${season}`).get()).data()?.standings ?? [];
    const facts = feed.tradeFacts({...trade, season}, standings);
    return await publishFeedPost({
      id: feed.feedId.trade(tradeId), type: "trade", season, week: null,
      title: `Trade: ${facts.teamA} ↔ ${facts.teamB}`,
      facts, prompt: feed.tradePrompt(facts, cfg.notesVoice ?? ""), template: feed.templateTrade(facts), cfg,
      check: feed.tradeCheck, maxAttempts: feed.TRADE_ATTEMPTS,
    });
  } catch (e) {
    console.error("publishTradeFeed failed:", e.message);
    return null;
  }
}

async function draftRecapNote({season, week, games, standings, cfg}) {
  if ((cfg.disabledAreas ?? []).includes("notesAgent")) return;
  const ref = db.doc(`leagueNotes/recap-${season}-w${week}`);
  const existing = (await ref.get()).data();
  // Never touch a note Jared already acted on.
  if (existing && existing.status !== "draft") return;

  const facts = notes.recapFacts({season, week, games, standings});
  if (!facts.games.length) return;

  let body = null;
  let writer = "claude";
  let writerError = null;
  try {
    body = await claudeDraft(notes.recapPrompt(facts, cfg.notesVoice ?? ""), cfg.notesModel ?? NOTES_MODEL);
  } catch (e) {
    writerError = e.message;
  }
  if (!body) { body = notes.templateRecap(facts); writer = "template"; }
  const flags = notes.factCheck(body, facts);

  const now = Date.now();
  await ref.set({
    type: "recap", status: "draft", season, week,
    draftBody: body, body,
    proposedSendAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
    destination: existing?.destination ?? "groupme",
    facts, flags, writer, writerError,
    createdAt: existing?.createdAt ?? admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  }, {merge: true});

  await sendGroupMeDM(COMMISSIONER_TEAM_NAME,
    `📝 Week ${week} recap drafted (${writer}) → Admin → Notes to approve.` +
    (flags.length ? `\n⚠️ Numbers not in the data: ${flags.join(", ")}` : "") +
    (writerError ? `\n(Claude unavailable: ${writerError.slice(0, 80)})` : "")).catch(() => {});
}

async function postToGroup(text) {
  const token = GROUPME_TOKEN.value();
  if (!token) throw new Error("GROUPME_TOKEN not set");
  const res = await fetch(`https://api.groupme.com/v3/groups/${GROUPME_GROUP_ID}/messages?token=${token}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({message: {source_guid: crypto.randomUUID(), text: text.slice(0, 1000)}}),
  });
  if (!res.ok) throw new Error(`GroupMe post HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function deliverNote(note) {
  if (note.destination === "app") {
    await db.collection("messages").add({content: note.body, timestamp: admin.firestore.Timestamp.now(), source: "leagueNotes"});
    return "app";
  }
  const gm = (await db.doc("config/groupme").get()).data() ?? {};
  const mode = groupMeMode(gm);
  if (mode === "paused") throw Object.assign(new Error("GroupMe is paused"), {retry: true});
  if (mode === "commissioner") {
    await sendGroupMeDM(COMMISSIONER_TEAM_NAME, `[would have posted to the league]\n${note.body}`);
    return "commissioner-test";
  }
  await postToGroup(note.body);
  return "groupme";
}

exports.sendLeagueNotes = onSchedule(
  {schedule: "every 5 minutes", timeZone: "America/Chicago", secrets: [GROUPME_TOKEN], retryCount: 0},
  async () => {
    const results = await notes.runSender({
      db,
      nowMs: () => Date.now(),
      stamp: () => admin.firestore.Timestamp.now(),
      deliver: deliverNote,
      onFailure: (id, e) => sendGroupMeDM(COMMISSIONER_TEAM_NAME, `❌ Note ${id} failed to send: ${e.message}`).catch(() => {}),
    });
    if (results.length) console.log("sendLeagueNotes:", JSON.stringify(results));
  },
);

exports.pollIfflFeed = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Chicago",
    secrets: [IFFL_FEED_URL, GROUPME_TOKEN],
    retryCount: 0,
  },
  async () => {
    const feedBase = IFFL_FEED_URL.value();
    if (!feedBase) {
      console.log("pollIfflFeed: IFFL_FEED_URL not set — skipping.");
      return;
    }
    const res = await runFeedSync({
      db,
      fetchImpl: fetch,
      feedBase: feedBase.replace(/\/+$/, ""),
      dm: (text) => sendGroupMeDM(COMMISSIONER_TEAM_NAME, text),
      nowIso: () => new Date().toISOString(),
      // Ledger rows must carry a real Timestamp — the transactions query
      // orders by createdAt, and Firestore sorts mixed types by type, so an
      // ISO string here would strand feed rows at the bottom of the ledger.
      nowTs: () => admin.firestore.Timestamp.now(),
      tsFromMs: (ms) => admin.firestore.Timestamp.fromMillis(ms),
    });
    console.log("pollIfflFeed:", JSON.stringify(res).slice(0, 400));
  },
);

exports.pollGroupMeTrades = onSchedule(
  {
    // Should lead pollEspnGmail (every 15 min). processEspnTrade no longer
    // holds a trade for a MISSING GroupMe signal, but it still holds one
    // when the signal names different teams than the ESPN email — and that
    // disagreement can only be caught if the signal was captured first. Ten
    // minutes keeps the signal ahead of the ESPN scan in the ordinary case.
    schedule: "every 10 minutes",
    timeZone: "America/Chicago",
    secrets: [GROUPME_TOKEN],
    retryCount: 0,
  },
  async () => {
    const token = GROUPME_TOKEN.value();
    if (!token) {
      console.error("pollGroupMeTrades: GROUPME_TOKEN secret not set — skipping");
      return;
    }

    const stateRef = db.doc("config/groupmePoller");
    const stateSnap = await stateRef.get();
    const lastSeenId = stateSnap.data()?.lastSeenId ?? null;

    let messages;
    try {
      messages = await fetchGroupMeMessagesSince(token, lastSeenId);
    } catch (err) {
      console.error("pollGroupMeTrades: fetch error:", err.message);
      await stateRef.set({lastError: err.message, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true});
      return;
    }

    if (messages.length === 0) {
      await stateRef.set({lastRunAt: admin.firestore.Timestamp.now(), lastError: null}, {merge: true});
      console.log("pollGroupMeTrades: no new messages");
      return;
    }

    // On the very first run (no lastSeenId), don't back-fill the entire
    // chat history as signals — just anchor state to the newest message
    // so we start capturing from here forward.
    const newestId = messages[messages.length - 1].id;
    if (!lastSeenId) {
      await stateRef.set(
        {lastSeenId: newestId, lastRunAt: admin.firestore.Timestamp.now(), lastError: null, initializedAt: admin.firestore.Timestamp.now()},
        {merge: true},
      );
      console.log(`pollGroupMeTrades: initialized state at message ${newestId} (no back-fill)`);
      return;
    }

    // Build stitched signal groups: a bare 🚨 and the deal text that follows
    // it from the same sender collapse into ONE review item, and each item
    // carries STRUCTURED extraction (picks, teams, direction phrases) — not
    // just "a keyword tripped". See groupmeParser.js.
    const groups = buildSignalGroups(messages);
    let hitCount = 0;
    const batch = db.batch();
    for (const g of groups) {
      hitCount++;
      // Doc id = primary (first) GroupMe message id of the group → naturally
      // idempotent; a redelivered/overlapping poll can't duplicate a signal.
      const sigRef = db.collection("groupmeTradeSignals").doc(g.primaryId);
      batch.set(sigRef, {
        messageId: g.primaryId,
        messageIds: g.messageIds, // all stitched msgs in this review item
        groupId: GROUPME_GROUP_ID,
        senderId: g.senderId,
        senderName: g.senderName,
        text: g.text,
        reasons: g.reasons,
        // Structured content for reconciliation + the review UI.
        picks: (g.extracted.picks || []).map((p) => ({
          year: p.year ?? null, round: p.round, raw: p.raw,
        })),
        teams: g.extracted.teams || [],
        directionPhrases: (g.extracted.directionPhrases || []).map((d) => ({
          team: d.team, verb: d.verb, raw: d.raw,
        })),
        hasPick: (g.extracted.picks || []).length > 0,
        status: "unreviewed",
        postedAt: g.postedAtSec ? admin.firestore.Timestamp.fromMillis(g.postedAtSec * 1000) : null,
        capturedAt: admin.firestore.Timestamp.now(),
      }, {merge: true});
    }

    batch.set(stateRef, {
      lastSeenId: newestId,
      lastRunAt: admin.firestore.Timestamp.now(),
      lastError: null,
      lastHitCount: hitCount,
    }, {merge: true});

    await batch.commit();
    console.log(`pollGroupMeTrades: scanned ${messages.length} msgs, captured ${hitCount} signal group(s), advanced to ${newestId}`);
  },
);

/**
 * pollEspnGmail — native replacement for the Make.com ESPN scraper.
 * Every 15 min: read the `espn-trade` Gmail label, parse each new
 * trade-accepted email, and run the SAME processEspnTrade() core the webhook
 * uses (roster match + Plan B reconcile + apply/hold). A per-message Firestore
 * doc (keyed by Gmail message id) guarantees no double-import. Stamps the same
 * heartbeat so we can see if the pipe goes silent.
 *
 * Auth: reuses the existing web OAuth client + a gmail.readonly refresh token
 * (secret GMAIL_REFRESH_TOKEN), minted once via scripts/mint-gmail-token.js.
 * The function no-ops quietly until that secret exists, so it's safe to deploy
 * BEFORE the one-time consent — it just logs "not configured" and returns.
 */
exports.pollEspnGmail = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "America/Chicago",
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GROUPME_TOKEN],
    retryCount: 0,
  },
  async () => {
    let clientId; let clientSecret; let refreshToken;
    try {
      clientId = GMAIL_OAUTH_CLIENT_ID.value();
      clientSecret = GMAIL_OAUTH_CLIENT_SECRET.value();
      refreshToken = GMAIL_REFRESH_TOKEN.value();
    } catch (e) {
      refreshToken = null;
    }
    if (!clientId || !clientSecret || !refreshToken) {
      console.log("pollEspnGmail: not configured yet (missing OAuth secret / refresh token) — skipping.");
      return;
    }

    const stateRef = db.doc("config/espnGmailPoller");
    let gmail;
    try {
      gmail = gmailWatch.createGmailClient({clientId, clientSecret, refreshToken});
    } catch (e) {
      console.error("pollEspnGmail: failed to build Gmail client:", e.message);
      await stateRef.set({lastError: e.message, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true}).catch(() => {});
      return;
    }

    try {
      const labelId = await gmailWatch.resolveLabelId(gmail, ESPN_TRADE_LABEL);
      if (!labelId) {
        console.warn(`pollEspnGmail: label "${ESPN_TRADE_LABEL}" not found on the account.`);
        await stateRef.set({lastError: `label ${ESPN_TRADE_LABEL} not found`, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true}).catch(() => {});
        return;
      }

      const ids = await gmailWatch.listLabeledMessageIds(gmail, labelId, 25);
      let processed = 0; let applied = 0; let held = 0; let skipped = 0;

      for (const id of ids) {
        // Dedupe: one doc per Gmail message id. Skip anything already seen.
        const seenRef = db.collection("espnGmailSeen").doc(id);
        const seen = await seenRef.get();
        if (seen.exists) { skipped++; continue; }

        const message = await gmailWatch.getMessage(gmail, id);
        const body = gmailWatch.decodeMessageBody(message.payload);
        const subject = gmailWatch.getSubject(message);
        const parsed = parseEspnTradeEmail(body);

        if (!parsed.ok) {
          const kind = classifyEspnEmail(body);

          // A void or an email we can't classify but which clearly concerns a
          // trade must NEVER be silently dropped — that is how a reversal
          // goes unnoticed. Surface it with its raw text so it can be acted
          // on, and so the void patterns can be tightened from a real sample.
          if (kind === "voided" || looksTradeRelated(body)) {
            await db.collection("tradeIngests").doc(`${id}__unhandled`).set({
              sourceId: `${id}__unhandled`,
              status: "needs_review",
              source: "espn-gmail",
              kind: kind === "voided" ? "espn_void" : "espn_unclassified",
              subject: subject ?? null,
              rawText: body.slice(0, 4000),
              reconcileReasons: [
                kind === "voided"
                  ? "ESPN appears to have VOIDED a trade. Find it in the ledger and reverse it — " +
                    "nothing has been undone automatically."
                  : "An email under the espn-trade label mentions a trade but could not be parsed. " +
                    "Read it and decide; nothing has been applied.",
              ],
              receivedAt: admin.firestore.Timestamp.now(),
            }).catch((e) => console.error("unhandled-email flag failed:", e.message));

            await sendGroupMeDM(
              COMMISSIONER_TEAM_NAME,
              kind === "voided"
                ? `↩️ ESPN may have VOIDED a trade. Nothing was undone automatically — ` +
                  `check Admin → Trades: ${APP_URL}`
                : `❓ An unreadable trade email arrived. Check Admin → Trades: ${APP_URL}`,
            ).catch(() => {});
          }

          // Mark seen so we don't re-examine it forever, but record why.
          await seenRef.set({
            messageId: id, subject, parsedOk: false, parseError: parsed.error,
            emailKind: kind,
            seenAt: admin.firestore.Timestamp.now(),
          });
          skipped++;
          continue;
        }

        // Heartbeat: the native pipe successfully read a real trade email.
        db.doc("config/espnIngest").set({
          lastIngestAt: admin.firestore.Timestamp.now(),
          lastIngestSource: "gmail-native",
        }, {merge: true}).catch(() => {});

        // sourceId = Gmail message id → stable + idempotent across both pipes.
        const result = await processEspnTrade({
          sourceId: id,
          // The email's own arrival time, not whenever the poller happened
          // to run — up to 15 minutes apart, which sorts the ledger wrongly.
          tradeDate: gmailWatch.getInternalDate(message),
          rawText: body.slice(0, 4000),
          moves: parsed.moves,
          sourceLabel: "espn-gmail",
        });

        await seenRef.set({
          messageId: id, subject, parsedOk: true,
          result: result.status, tradeId: result.tradeId ?? null,
          seenAt: admin.firestore.Timestamp.now(),
        });
        processed++;
        if (result.status === "applied") applied++;
        else if (result.status === "needs_review") held++;
      }

      await stateRef.set({
        lastRunAt: admin.firestore.Timestamp.now(),
        lastError: null,
        lastScanned: ids.length,
        lastProcessed: processed,
        lastApplied: applied,
        lastHeld: held,
        lastSkipped: skipped,
      }, {merge: true});
      console.log(`pollEspnGmail: scanned ${ids.length}, processed ${processed} (applied ${applied}, held ${held}), skipped ${skipped}.`);
    } catch (e) {
      console.error("pollEspnGmail: run error:", e.message);
      await stateRef.set({lastError: e.message, lastRunAt: admin.firestore.Timestamp.now()}, {merge: true}).catch(() => {});
    }
  },
);

// ── Offline test surface ──────────────────────────────────────
// The pipeline's orchestration — dedupe, roster match, reconcile, apply,
// and the accept→execute→completed hop — is the part most worth testing,
// and none of it is reachable through the wrapped triggers without a live
// Firestore. This machine has no Java, so the Firestore emulator can't run
// either. functions/pipeline.test.js injects a fake Firestore and drives
// these directly. Production never touches this export.
exports.__test__ = {processEspnTrade, executeTradeAssets, handleTradeWrite, reverseTradeAssets, publishWeekFeed, publishTradeFeed, watchRecords, publishMilestones, runWatchdog};

// League-state export consumed by the Agent Control Center on the NAS
// (job `iffl-snapshot`). Shared-secret auth; see leagueState.js.
exports.leagueState = require("./leagueState").leagueState;
