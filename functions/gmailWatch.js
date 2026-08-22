// gmailWatch — native Gmail reader for the ESPN trade-accepted emails.
// Replaces the Make.com scraper (scenario 4432877) so the ESPN ingest pipe
// lives entirely in this Cloud Functions codebase.
//
// Auth: a one-time OAuth consent mints a gmail.readonly refresh token, stored
// as the Firebase secret GMAIL_REFRESH_TOKEN. The OAuth CLIENT id/secret are
// the existing web client (GOOGLE_OAUTH_CLIENT_ID_WEB / _SECRET_WEB), also
// stored as secrets. No new console setup required.
//
// This module is intentionally thin + mostly pure so the message-body decode
// and label logic unit-test without hitting Google. The live fetch is behind
// createGmailClient() which the scheduler calls.

const {google} = require("googleapis");

/**
 * Build an authenticated Gmail client from OAuth creds + a refresh token.
 * clientId/clientSecret/refreshToken come from Firebase secrets at runtime.
 */
function createGmailClient({clientId, clientSecret, refreshToken}) {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({refresh_token: refreshToken});
  return google.gmail({version: "v1", auth: oauth2});
}

/**
 * Decode a Gmail message payload into a single plain-text string.
 * Gmail encodes bodies base64url, possibly split across MIME parts. We prefer
 * text/plain; fall back to stripping tags from text/html. Pure + testable.
 */
function decodeMessageBody(payload) {
  if (!payload) return "";
  const b64 = (data) => Buffer.from(String(data || ""), "base64").toString("utf8");

  // Collect all parts recursively.
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    if (p.body && p.body.data) parts.push({mimeType: p.mimeType || "", data: p.body.data});
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);

  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain) return b64(plain.data);

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html) {
    return b64(html.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n");
  }

  // Single-part message: body on the payload itself.
  if (payload.body && payload.body.data) return b64(payload.body.data);
  return "";
}

/**
 * Resolve a Gmail label NAME (e.g. "espn-trade") to its label ID for the
 * authenticated user. Returns null if the label doesn't exist.
 */
async function resolveLabelId(gmail, labelName) {
  const res = await gmail.users.labels.list({userId: "me"});
  const labels = res.data.labels || [];
  const wanted = String(labelName).toLowerCase();
  const hit = labels.find((l) => String(l.name).toLowerCase() === wanted);
  return hit ? hit.id : null;
}

/**
 * List message IDs under a label, newest first, capped. Uses the label ID.
 */
async function listLabeledMessageIds(gmail, labelId, max = 25) {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults: max,
  });
  return (res.data.messages || []).map((m) => m.id);
}

/** Fetch one full message (metadata + body payload). */
async function getMessage(gmail, id) {
  const res = await gmail.users.messages.get({userId: "me", id, format: "full"});
  return res.data;
}

/** Extract the Subject header from a Gmail message. */
function getSubject(message) {
  const headers = message?.payload?.headers || [];
  const h = headers.find((x) => String(x.name).toLowerCase() === "subject");
  return h ? h.value : "";
}

module.exports = {
  createGmailClient,
  decodeMessageBody,
  resolveLabelId,
  listLabeledMessageIds,
  getMessage,
  getSubject,
};
