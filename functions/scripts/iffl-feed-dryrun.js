// iffl-feed-dryrun — fetch Jason's league feed, fetch our live Firestore
// state, and print/save the full diff WITHOUT writing anything anywhere.
//
// Read-only by construction: Firestore access is plain GET requests via the
// REST API; there is no code path in this file that issues a write.
//
// Usage (from functions/):
//   IFFL_FEED_BASE="https://.../exports/<hash>" \
//   FIRESTORE_TOKEN="$(gcloud auth print-access-token)" \
//   node scripts/iffl-feed-dryrun.js [--out /path/to/report.md]
//
// The feed URL is deliberately an env var — the guide says keep it private,
// so it never appears in this repo.

const fs = require("node:fs");
const { diffSnapshot } = require("../ifflFeed");

const FEED = process.env.IFFL_FEED_BASE;
const TOKEN = process.env.FIRESTORE_TOKEN;
const PROJECT = "iffl-auth";
if (!FEED || !TOKEN) {
  console.error("Set IFFL_FEED_BASE and FIRESTORE_TOKEN. Nothing was fetched.");
  process.exit(1);
}

/** Decode Firestore REST's typed value wrappers into plain JS. */
function decodeValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue; // ISO string is fine here
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

async function fetchCollection(name) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Firestore ${name}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const d of body.documents ?? []) {
      docs.push({ id: d.name.split("/").pop(), ...decodeFields(d.fields ?? {}) });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

async function fetchFeed(file) {
  const res = await fetch(`${FEED}/${file}`);
  if (!res.ok) throw new Error(`feed ${file}: HTTP ${res.status}`);
  return res.json();
}

function fmtList(items, render, max = 40) {
  const shown = items.slice(0, max).map(render);
  if (items.length > max) shown.push(`… and ${items.length - max} more`);
  return shown.map((l) => `- ${l}`).join("\n") || "- (none)";
}

async function main() {
  const [league, players, draftPicks, trades] = await Promise.all([
    fetchFeed("league.json"),
    fetchCollection("players"),
    fetchCollection("draftPicks"),
    fetchCollection("trades"),
  ]);

  const r = diffSnapshot(league, { players, draftPicks, trades });

  const md = `# IFFL Feed Dry Run — ${new Date().toISOString().slice(0, 16)}Z

Feed last_changed_at: **${r.generatedFrom.feedLastChanged}** · season ${r.generatedFrom.feedSeason} · format v${r.generatedFrom.formatVersion}
Our data: ${players.length} players · ${draftPicks.length} picks · ${trades.length} trades. **Nothing was written.**

${r.problems.length ? `## ⛔ PROBLEMS\n${fmtList(r.problems, (p) => p)}\n` : ""}
## Teams
All ${r.teams.length} owners mapped:
${fmtList(r.teams, (t) => `${t.owner} → **${t.ourName}** (feed name: "${t.feedName}")`)}

## Players
Matched **${r.players.matchedCount}** (${Object.entries(r.players.matchVia).map(([k, v]) => `${v} by ${k}`).join(", ")}) · feed free agents ignored: ${r.players.feedFreeAgentsIgnored}

### Team changes (${r.players.teamChanges.length}) — armed sync would move these
${fmtList(r.players.teamChanges, (c) => `**${c.name}**: ours ${c.ours} → feed says **${c.feed}**`)}

### Became free agents (${r.players.becameFreeAgent.length}) — armed sync would deactivate
${fmtList(r.players.becameFreeAgent, (f) => `**${f.name}** (was ${f.from})${f.becameFaAt ? ` — FA since ${f.becameFaAt}` : ""}`)}

### Price mismatches (${r.players.priceMismatches.length}) — feed is authoritative
${fmtList(r.players.priceMismatches, (p) => `**${p.name}** (${p.team}): ${p.diffs.map((d) => `${d.year} ours $${d.ours} vs feed $${d.feed}`).join(", ")}`)}

### Contract anchor mismatches (${r.players.anchorMismatches.length})
${fmtList(r.players.anchorMismatches, (a) => `**${a.name}**: ${a.diffs.map((d) => `${d.field} ours ${d.ours} vs feed ${d.feed}`).join(", ")}`)}

### Would create (${r.players.toCreate.length}) — feed-rostered, unknown to us
${fmtList(r.players.toCreate, (c) => `**${c.name}** (${c.position}, ${c.team}) ifflId ${c.ifflId}`)}

### Ambiguous (${r.players.ambiguous.length}) — need a human, never guessed
${fmtList(r.players.ambiguous, (a) => `**${a.feedName}** → candidates: ${a.candidates.join(", ")}`)}

### Ours unmatched (${r.players.oursUnmatched.length}) — active here, unknown to the feed
${fmtList(r.players.oursUnmatched, (p) => `**${p.name}** (${p.teamName ?? "?"}) [${p.id}]`)}

## Draft picks
### Ownership changes (${r.picks.ownershipChanges.length})
${fmtList(r.picks.ownershipChanges, (c) => `${c.key}: ours ${c.ours} → feed **${c.feed}**`)}

Feed picks with no counterpart here: ${r.picks.feedUnmatched.length} · ours unknown to feed: ${r.picks.oursUnmatched.length}

## Trades
Adopted cleanly: **${r.trades.adopted.length}** · adopted but feed has MORE items: **${r.trades.adoptedNeedingItems.length}** · new from feed: **${r.trades.newFromFeed.length}** · ours the feed lacks: **${r.trades.oursUnmatched.length}**

### Adopted, feed has items we lack (picks, usually)
${fmtList(r.trades.adoptedNeedingItems, (t) => `${t.date} ${t.teams.join(" ↔ ")} — feed ${t.feedItems} items vs our ${t.ourItems}: ${t.missingHere.join(", ")} [our ${t.ourTradeId}]`)}

### New from feed — we'd create these
${fmtList(r.trades.newFromFeed, (t) => `${t.date} ${t.teams.join(" ↔ ")}: ${t.items.join(", ")}`)}

### Ours the feed doesn't have
${fmtList(r.trades.oursUnmatched, (t) => `${String(t.date).slice(0, 10)} ${t.teams.join(" ↔ ")} (${t.status}) [${t.id}]`)}
`;

  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
  if (outPath) {
    fs.writeFileSync(outPath, md);
    console.log(`report written to ${outPath}\n`);
  }
  // Terminal summary — the counts, not the wall of names.
  console.log(`teams mapped: ${r.teams.length}/12  problems: ${r.problems.length}`);
  console.log(`players: ${r.players.matchedCount} matched | ${r.players.teamChanges.length} team changes | ${r.players.becameFreeAgent.length} became FA | ${r.players.priceMismatches.length} price mismatches | ${r.players.toCreate.length} to create | ${r.players.ambiguous.length} ambiguous | ${r.players.oursUnmatched.length} ours-unmatched`);
  console.log(`picks: ${r.picks.ownershipChanges.length} ownership changes | trades: ${r.trades.adopted.length} adopted, ${r.trades.adoptedNeedingItems.length} need items, ${r.trades.newFromFeed.length} new, ${r.trades.oursUnmatched.length} ours-only`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
