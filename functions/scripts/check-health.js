#!/usr/bin/env node
// Critical-process check for the deploy workflow. Read-only.
// Auth: GOOGLE_APPLICATION_CREDENTIALS (the CI service account).
// Exit 1 on any red. Writes a markdown summary to $HEALTH_OUT if set.
const admin = require("firebase-admin");
const fs = require("node:fs");
const {checks, evaluate} = require("../pollerHealth");

admin.initializeApp({projectId: process.env.FIREBASE_PROJECT || "iffl-auth"});
const db = admin.firestore();

(async () => {
  const cfg = (await db.doc("config/league").get()).data() ?? {};
  const season = cfg.activeSeasonYear ?? new Date().getFullYear();
  const docs = {};
  for (const c of checks(season)) {
    const snap = await db.doc(c.path).get();
    docs[c.path] = snap.exists ? snap.data() : null;
  }
  const results = evaluate(docs, new Date(), season);
  const lines = results.map((r) => `${r.skipped ? "⏭" : r.ok ? "✅" : "❌"} ${r.name}: ${r.reason}`);
  console.log(lines.join("\n"));
  if (process.env.HEALTH_OUT) fs.writeFileSync(process.env.HEALTH_OUT, lines.join("\n") + "\n");
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error("check-health failed:", e.message);
  process.exit(1);
});
