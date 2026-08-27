// iffl-feed-onboard — the ONE-TIME identity stamp: write `ifflId` (and
// `espnId` when the feed has one) onto every matched player doc, so every
// future sync matches by stored id and never by name again.
//
// Additive only: the write mask covers exactly [ifflId, espnId]. No name,
// team, price, or any other field is touched, and nothing reads these
// fields yet — so this changes zero behavior until the sync is armed.
// Re-running is a no-op for already-stamped docs.
//
// Usage (from functions/):
//   IFFL_FEED_BASE=... FIRESTORE_TOKEN="$(gcloud auth print-access-token)" \
//   node scripts/iffl-feed-onboard.js            # plan only, writes nothing
//   node scripts/iffl-feed-onboard.js --apply    # stamp
//
// Self-contained REST helpers on purpose — the proven dry-run script stays
// untouched, and two small scripts sharing 40 duplicated lines is cheaper
// than destabilizing one to de-duplicate the other.

const { matchPlayers, matchTeams } = require("../ifflFeed");

const FEED = process.env.IFFL_FEED_BASE;
const TOKEN = process.env.FIRESTORE_TOKEN;
const PROJECT = "iffl-auth";
const APPLY = process.argv.includes("--apply");
if (!FEED || !TOKEN) {
  console.error("Set IFFL_FEED_BASE and FIRESTORE_TOKEN. Nothing was fetched.");
  process.exit(1);
}

/**
 * The manual fixups the dry run surfaced — the guide's predicted "handful
 * needing manual mapping." Feed ifflId → our doc id. Each is verified at
 * runtime (both sides exist, teams agree) before anything is written; any
 * failure aborts the whole run rather than stamping a wrong identity.
 */
const MANUAL_MAP = {
  363: "NQ99JuhjHJonKXJk4u9J", // feed "Quentin Johnson"    → ours "Quentin Johnston" (Cantone)
  304: "XuONLAFxgUyampjg6crM", // feed "Jaydon Blue"        → ours "Jayden Blue" (Bill)
  487: "rookie2026-2-05",      // feed "Nicholas Singleton" → ours "Nick Singleton" (Foley)
};

function decodeValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decodeValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  return null;
}

async function fetchPlayers() {
  const docs = [];
  let pageToken = "";
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/players?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Firestore players: HTTP ${res.status}`);
    const body = await res.json();
    for (const d of body.documents ?? []) {
      docs.push({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, decodeValue(v)])) });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

async function batchWrite(writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:batchWrite`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`batchWrite: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  const failed = (body.status ?? []).filter((s) => s.code && s.code !== 0);
  if (failed.length) throw new Error(`batchWrite: ${failed.length} writes failed: ${JSON.stringify(failed[0])}`);
}

async function main() {
  const feedRes = await fetch(`${FEED}/league.json`);
  if (!feedRes.ok) throw new Error(`feed: HTTP ${feedRes.status}`);
  const league = await feedRes.json();
  if ((league.format_version ?? 0) > 1) throw new Error(`format_version ${league.format_version} > 1 — refusing`);

  const ours = await fetchPlayers();
  const oursById = new Map(ours.map((p) => [p.id, p]));
  const teams = matchTeams(league.teams);
  if (teams.problems.length) throw new Error(`team mapping: ${teams.problems.join("; ")}`);
  const teamName = (id) => teams.byIfflId.get(id)?.ourName ?? null;

  const { matched } = matchPlayers(league.players, ours);
  const pairs = matched.map((m) => ({ feed: m.feed, ours: m.ours, via: m.via }));

  // Manual mappings, verified hard before they join the batch.
  const feedById = new Map(league.players.map((p) => [p.id, p]));
  for (const [ifflIdStr, ourDocId] of Object.entries(MANUAL_MAP)) {
    const fp = feedById.get(Number(ifflIdStr));
    const op = oursById.get(ourDocId);
    if (!fp) throw new Error(`manual map: feed player ${ifflIdStr} not in feed`);
    if (!op) throw new Error(`manual map: our doc ${ourDocId} not found`);
    const ft = fp.team_id != null ? teamName(fp.team_id) : null;
    if (ft !== (op.teamName ?? null)) {
      throw new Error(`manual map ${fp.name} → ${op.name}: teams disagree (feed ${ft} vs ours ${op.teamName}) — refusing to stamp`);
    }
    pairs.push({ feed: fp, ours: op, via: "manual" });
  }

  const writes = [];
  let alreadyStamped = 0;
  const conflicts = [];
  for (const { feed, ours: op } of pairs) {
    if (op.ifflId != null && Number(op.ifflId) !== feed.id) {
      conflicts.push(`${op.name} [${op.id}] already has ifflId ${op.ifflId}, feed says ${feed.id}`);
      continue;
    }
    if (Number(op.ifflId) === feed.id && (feed.espn_id == null || Number(op.espnId) === Number(feed.espn_id))) {
      alreadyStamped++;
      continue;
    }
    const fields = { ifflId: { integerValue: String(feed.id) } };
    const mask = ["ifflId"];
    if (feed.espn_id != null) { fields.espnId = { integerValue: String(feed.espn_id) }; mask.push("espnId"); }
    writes.push({
      update: { name: `projects/${PROJECT}/databases/(default)/documents/players/${op.id}`, fields },
      updateMask: { fieldPaths: mask },
    });
  }

  if (conflicts.length) {
    console.error(`⛔ ${conflicts.length} identity conflicts — nothing written:`);
    conflicts.forEach((c) => console.error("  " + c));
    process.exit(1);
  }

  console.log(`matched ${pairs.length} (incl. ${Object.keys(MANUAL_MAP).length} manual) | to stamp: ${writes.length} | already stamped: ${alreadyStamped}`);
  if (!APPLY) { console.log("plan only — re-run with --apply to write."); return; }

  for (let i = 0; i < writes.length; i += 400) {
    await batchWrite(writes.slice(i, i + 400));
    console.log(`  wrote ${Math.min(i + 400, writes.length)}/${writes.length}`);
  }
  console.log("done.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
