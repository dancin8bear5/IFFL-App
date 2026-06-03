const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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

/**
 * Fires on every write to the trades collection.
 * Sends push notifications to the relevant team(s) based on what changed.
 */
exports.onTradeWrite = functions.firestore
  .document("trades/{tradeId}")
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after  = change.after.exists  ? change.after.data()  : null;
    if (!after) return null;

    const proposer = after.proposingTeamName;
    const receiver = after.receivingTeamName;

    // New trade created
    if (!before) {
      await sendPush(
        receiver,
        `Trade Offer from ${proposer}`,
        `${proposer} wants to make a deal. Open the app to review.`
      );
      return null;
    }

    // No status change — nothing to notify
    if (before.status === after.status) return null;

    switch (after.status) {
      case "accepted":
        await sendPush(proposer, "Trade Accepted",
          `${receiver} accepted your trade offer.`);
        break;

      case "rejected":
        await sendPush(proposer, "Trade Declined",
          `${receiver} declined your trade offer.`);
        break;

      case "countered":
        await sendPush(proposer, `Counter Offer from ${receiver}`,
          `${receiver} sent a counter-offer. Open the app to review.`);
        break;

      case "completed":
        await sendPush(proposer, "Trade Executed",
          `Your trade with ${receiver} has been completed.`);
        await sendPush(receiver, "Trade Executed",
          `Your trade with ${proposer} has been completed.`);
        break;

      default:
        break;
    }

    return null;
  });
