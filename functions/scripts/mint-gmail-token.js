#!/usr/bin/env node
// mint-gmail-token.js — ONE-TIME: authorize gmail.readonly and print a
// refresh token to store as the Firebase secret GMAIL_REFRESH_TOKEN.
//
// Usage (from functions/):
//   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/mint-gmail-token.js
//
// It starts a tiny localhost server, opens the Google consent screen, catches
// the redirect, exchanges the code, and prints the refresh token. Nothing is
// stored by this script — you copy the token into a Firebase secret.
//
// REQUIREMENT: the OAuth client (the existing web client is fine) must list
//   http://localhost:53682/oauth2callback
// as an authorized redirect URI. If it doesn't, the script prints the exact
// URI to add and how.

const http = require("http");
const {google} = require("googleapis");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = ["https://www.googleapis.com/auth/gmail.readonly"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\nMissing env. Run:\n  GMAIL_CLIENT_ID=<web client id> GMAIL_CLIENT_SECRET=<web client secret> node scripts/mint-gmail-token.js\n");
  console.error("Also add this redirect URI to that OAuth client in Google Cloud Console → Credentials:");
  console.error("  " + REDIRECT + "\n");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token even on re-consent
  scope: SCOPE,
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) {
    res.writeHead(404); res.end("not here"); return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end(`Consent error: ${err}. You can close this tab.`);
    console.error("Consent error:", err);
    server.close(); process.exit(1);
  }
  try {
    const {tokens} = await oauth2.getToken(code);
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end("Authorized. You can close this tab and return to the terminal.");
    console.log("\n============================================================");
    if (tokens.refresh_token) {
      console.log("REFRESH TOKEN (store as Firebase secret GMAIL_REFRESH_TOKEN):\n");
      console.log(tokens.refresh_token);
      console.log("\nNext, from functions/:");
      console.log("  firebase functions:secrets:set GMAIL_REFRESH_TOKEN   # paste it");
      console.log("  firebase functions:secrets:set GMAIL_OAUTH_CLIENT_ID # paste client id");
      console.log("  firebase functions:secrets:set GMAIL_OAUTH_CLIENT_SECRET # paste client secret");
    } else {
      console.log("No refresh_token returned. Re-run with a fresh consent");
      console.log("(revoke prior access at https://myaccount.google.com/permissions, then retry).");
    }
    console.log("============================================================\n");
  } catch (e) {
    res.writeHead(500); res.end("token exchange failed: " + e.message);
    console.error("Token exchange failed:", e.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser to authorize Gmail read access:\n");
  console.log(authUrl + "\n");
  console.log(`(Waiting for the redirect to ${REDIRECT} …)\n`);
});
