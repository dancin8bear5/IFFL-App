// leagueNotes — agent #3 (docs/agents/03-league-notes-agent.md).
//
// The agent DRAFTS; Jared decides what goes out and when. Pure logic here
// (state machine, due selection, recap facts, fact check, prompt); the
// Firestore/GroupMe/Claude I/O lives in index.js.
//
//   draft ──approve(body, sendAt)──▶ approved ──sendAt ≤ now──▶ sending ──▶ sent
//     │                                 │
//     └──reject──▶ rejected             └──unapprove──▶ draft
//
// There is no edge from draft to sent. firestore.rules enforces the same
// graph for clients, and only the sender function writes sending/sent.

const STATUSES = ["draft", "approved", "rejected", "sending", "sent", "failed"];
const DESTINATIONS = ["groupme", "app"];

/** Client-side (commissioner) transitions. Throws on anything illegal. */
function transition(note, action, patch = {}) {
  const s = note?.status;
  const bad = (why) => { throw new Error(`Illegal ${action} from '${s}': ${why}`); };
  switch (action) {
    case "approve": {
      if (s !== "draft") bad("only a draft can be approved");
      const body = (patch.body ?? note.body ?? note.draftBody ?? "").trim();
      if (!body) bad("empty body");
      const sendAt = patch.sendAt ?? note.sendAt ?? note.proposedSendAt;
      if (!sendAt) bad("no send time");
      const dest = patch.destination ?? note.destination ?? "groupme";
      if (!DESTINATIONS.includes(dest)) bad(`unknown destination ${dest}`);
      return {status: "approved", body, sendAt, destination: dest};
    }
    case "unapprove":
      if (s !== "approved") bad("only an approved note can be pulled back");
      return {status: "draft"};
    case "reject":
      if (s !== "draft" && s !== "approved") bad("already sent or rejected");
      return {status: "rejected"};
    case "edit":
      if (s !== "draft") bad("unapprove before editing");
      return {
        ...(patch.body != null ? {body: String(patch.body)} : {}),
        ...(patch.sendAt ? {proposedSendAt: patch.sendAt} : {}),
        ...(patch.destination ? {destination: patch.destination} : {}),
      };
    default:
      bad("unknown action");
  }
}

const ms = (v) => (v == null ? null : typeof v.toMillis === "function" ? v.toMillis() : +new Date(v));

/** Approved, has a body, and its time has come. Nothing else is ever due. */
function isDue(note, nowMs) {
  if (note?.status !== "approved") return false;
  if (!String(note.body ?? "").trim()) return false;
  const t = ms(note.sendAt);
  return Number.isFinite(t) && t <= nowMs;
}

/**
 * The facts a weekly recap may use. Everything the writer is allowed to
 * say comes from here — the fact check below rejects any number that
 * doesn't.
 * @param games      parseScoreboard(data, week).games (final)
 * @param standings  parseStandings(data).standings
 */
function recapFacts({season, week, games, standings}) {
  const finals = (games ?? []).filter((g) => g.final && g.home && g.away);
  const scores = finals.flatMap((g) => [
    {team: g.home, points: g.homeScore, opp: g.away, oppPoints: g.awayScore},
    {team: g.away, points: g.awayScore, opp: g.home, oppPoints: g.homeScore},
  ]);
  const byPts = [...scores].sort((a, b) => b.points - a.points);
  const margin = (g) => Math.abs(g.homeScore - g.awayScore);
  const byMargin = [...finals].sort((a, b) => margin(a) - margin(b));
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    season, week,
    games: finals.map((g) => {
      const homeWon = g.homeScore >= g.awayScore;
      return {
        winner: homeWon ? g.home : g.away, winnerPoints: r2(homeWon ? g.homeScore : g.awayScore),
        loser: homeWon ? g.away : g.home, loserPoints: r2(homeWon ? g.awayScore : g.homeScore),
        margin: r2(margin(g)),
      };
    }),
    high: byPts[0] ? {team: byPts[0].team, points: r2(byPts[0].points)} : null,
    low: byPts.at(-1) ? {team: byPts.at(-1).team, points: r2(byPts.at(-1).points)} : null,
    closest: byMargin[0] ? {home: byMargin[0].home, away: byMargin[0].away, margin: r2(margin(byMargin[0]))} : null,
    blowout: byMargin.at(-1) ? {home: byMargin.at(-1).home, away: byMargin.at(-1).away, margin: r2(margin(byMargin.at(-1)))} : null,
    standings: (standings ?? []).map((s) => ({place: s.place, team: s.teamName, record: s.record, pointsFor: s.pointsFor})),
  };
}

/** Deterministic recap — used when no Claude key is configured, and as the fallback. */
function templateRecap(f) {
  if (!f.games.length) return "";
  const lines = [`🏈 IFFL Week ${f.week} recap`];
  for (const g of f.games) lines.push(`• ${g.winner} ${g.winnerPoints} def. ${g.loser} ${g.loserPoints}`);
  if (f.high) lines.push(`🔥 High score: ${f.high.team} (${f.high.points})`);
  if (f.low) lines.push(`🧊 Low score: ${f.low.team} (${f.low.points})`);
  if (f.closest) lines.push(`😬 Closest: ${f.closest.home} vs ${f.closest.away}, ${f.closest.margin} pts`);
  if (f.standings.length) {
    lines.push("", "Top of the table:");
    for (const s of f.standings.slice(0, 3)) lines.push(`${s.place}. ${s.team} ${s.record}`);
  }
  return lines.join("\n");
}

/** Every number anywhere in the facts, in the forms a writer might print it. */
function allowedNumbers(facts) {
  const out = new Set();
  const add = (n) => {
    if (!Number.isFinite(n)) return;
    out.add(String(n));
    out.add(n.toFixed(1)); out.add(n.toFixed(2)); out.add(String(Math.round(n)));
  };
  const walk = (v) => {
    if (typeof v === "number") add(v);
    else if (typeof v === "string") for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) add(Number(m));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  for (let i = 0; i <= 12; i++) out.add(String(i)); // counts, places, "top 3"
  return out;
}

/**
 * Numbers in the draft that are NOT in the facts. Non-empty = the writer
 * invented something; the draft is flagged for Jared, never auto-cleared.
 */
function factCheck(body, facts) {
  const ok = allowedNumbers(facts);
  const found = String(body ?? "").match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.filter((n) => !ok.has(n) && !ok.has(String(Number(n)))))];
}

function recapPrompt(facts, voice = "") {
  return [
    "You write the weekly recap for IFFL, a 20-year dynasty keeper fantasy football league of 12 friends.",
    "Tone: sharp, funny, trash-talky, affectionate. Under 900 characters. Plain text for GroupMe (emoji OK, no markdown headers).",
    voice ? `League voice notes:\n${voice}` : "",
    "HARD RULES: use ONLY the facts below. Every number you print must appear in the facts exactly. Do not invent stats, injuries, players, or history.",
    "Facts (JSON):",
    JSON.stringify(facts),
  ].filter(Boolean).join("\n\n");
}

/**
 * One sender pass. Injected I/O so the claim/guard logic is testable
 * against harness/fakeFirestore.js.
 *   deliver(note) → via string; throw {retry:true} to hold, anything else fails
 */
async function runSender({db, nowMs, deliver, stamp, onFailure = async () => {}}) {
  const snap = await db.collection("leagueNotes").where("status", "==", "approved").get();
  const results = [];
  for (const d of snap.docs) {
    const ref = d.ref ?? db.doc(`leagueNotes/${d.id}`);
    if (!isDue(d.data(), nowMs())) continue;
    // Claim it. Overlapping runs can both see "approved"; only one wins.
    const claimed = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (!isDue(cur, nowMs())) return null;
      tx.update(ref, {status: "sending", sendingAt: stamp()});
      return cur;
    });
    if (!claimed) continue;
    try {
      const via = await deliver(claimed);
      await ref.update({status: "sent", sentAt: stamp(), sentVia: via, lastError: null});
      results.push({id: d.id, status: "sent", via});
    } catch (e) {
      await ref.update({status: e.retry ? "approved" : "failed", lastError: e.message});
      results.push({id: d.id, status: e.retry ? "held" : "failed", error: e.message});
      if (!e.retry) await onFailure(d.id, e);
    }
  }
  return results;
}

module.exports = {
  runSender,
  STATUSES, DESTINATIONS, transition, isDue, recapFacts, templateRecap, factCheck, recapPrompt, allowedNumbers,
};
