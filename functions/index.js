const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// GroupMe personal access token — set once from the Mac terminal:
//   firebase functions:secrets:set GROUPME_TOKEN
// Never lives in git, the app bundle, or Firestore.
const GROUPME_TOKEN = defineSecret("GROUPME_TOKEN");

const APP_URL = "https://iffl-auth.web.app";
const COMMISSIONER_EMAIL = "jaredrogtaylor@gmail.com";

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

async function groupmeUserIdForTeam(teamName) {
  const doc = await db.doc("config/groupme").get();
  return doc.data()?.userMap?.[teamName] ?? null;
}

async function sendGroupMeDM(teamName, text) {
  const token = GROUPME_TOKEN.value();
  if (!token) return;
  const recipientId = await groupmeUserIdForTeam(teamName);
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
        await sendPush(proposer, "Trade Accepted",
          `${receiver} accepted your trade offer.`);
        await sendGroupMeDM(
          proposer,
          `✅ ${receiver} ACCEPTED your trade offer!\n` +
          `You get: ${theyGet}\nThey get: ${youGet}\n` +
          `Commissioner will execute once the player swap is done in ESPN.`,
        );
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
        await sendPush(proposer, "Trade Executed",
          `Your trade with ${receiver} has been completed.`);
        await sendPush(receiver, "Trade Executed",
          `Your trade with ${proposer} has been completed.`);
        await sendGroupMeDM(proposer,
          `🤝 Trade with ${receiver} is executed and official. Rosters are updated in the app.`);
        await sendGroupMeDM(receiver,
          `🤝 Trade with ${proposer} is executed and official. Rosters are updated in the app.`);
        break;

      default:
        break;
    }

    return null;
  },
);

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
