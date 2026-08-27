// ifflFeedSync — the recurring feed sync's engine. Phase 3: REPORT ONLY.
//
// Every run: fetch meta.json, and only when `last_changed_at` has advanced
// past what we last processed, fetch league.json, diff it against Firestore,
// and record the diff — as a report document and a commissioner DM. Nothing
// in report mode mutates league data; the only writes are its own state and
// report docs under config/.
//
// Dependencies are injected (db, fetchImpl, dm, nowIso) so the whole engine
// tests offline against the fake Firestore — the same discipline as the
// trade pipeline, and for the same reason: the orchestration is the part
// that breaks, so the orchestration is the part under test.
//
// Guide rules enforced here:
//   - Compare last_changed_at only (generated_at moves on deploys).
//   - format_version > 1 → stop and flag loudly, import nothing.
//   - A failed fetch keeps existing data and tries again later — trivially
//     true in report mode, and load-bearing once armed.

const { diffSnapshot } = require("./ifflFeed");
const { planApply } = require("./ifflFeedApply");

const STATE_DOC = "config/ifflFeed";
const REPORT_DOC = "config/ifflFeedReport";

/** Cap the report's arrays so the doc stays far from Firestore's 1MB limit. */
function trimReport(report, max = 100) {
  const out = JSON.parse(JSON.stringify(report));
  const walk = (obj) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (Array.isArray(v) && v.length > max) {
        obj[`${k}Total`] = v.length;
        obj[k] = v.slice(0, max);
      } else if (v && typeof v === "object" && !Array.isArray(v)) walk(v);
    }
  };
  walk(out);
  return out;
}

function summarize(r) {
  return (
    `players: ${r.players.teamChanges.length} team moves, ${r.players.becameFreeAgent.length} to FA, ` +
    `${r.players.priceMismatches.length} price diffs, ${r.players.toCreate.length} new · ` +
    `picks: ${r.picks.ownershipChanges.length} moves · ` +
    `trades: ${r.trades.newFromFeed.length} new, ${r.trades.adoptedNeedingItems.length} need items`
  );
}

/**
 * One sync pass. Returns {status, ...detail}; never throws for expected
 * conditions — a thrown error is a bug, not a bad feed day.
 */
async function runFeedSync({ db, fetchImpl, feedBase, dm, nowIso, nowTs, tsFromMs }) {
  const stateRef = db.doc(STATE_DOC);
  const state = (await stateRef.get()).data() ?? {};

  let meta;
  try {
    const res = await fetchImpl(`${feedBase}/meta.json`);
    if (!res.ok) throw new Error(`meta.json HTTP ${res.status}`);
    meta = await res.json();
  } catch (e) {
    await stateRef.set({ lastError: `meta: ${e.message}`, lastRunAt: nowIso() }, { merge: true });
    return { status: "fetch_error", error: e.message };
  }

  // The guide's one comparison rule: last_changed_at only, and it is
  // monotonic — so string comparison of ISO timestamps is sufficient.
  const lastProcessed = state.lastProcessedChangedAt ?? "";
  if (!(meta.last_changed_at > lastProcessed)) {
    await stateRef.set({ lastRunAt: nowIso(), lastError: null }, { merge: true });
    return { status: "no_change", lastProcessed };
  }

  if ((meta.format_version ?? 0) > 1) {
    await stateRef.set({
      lastRunAt: nowIso(),
      lastError: `format_version ${meta.format_version} > 1 — imports stopped`,
    }, { merge: true });
    await dm(`⛔ The league feed moved to format_version ${meta.format_version}. Syncing is stopped until the integration is updated.`);
    return { status: "format_blocked", formatVersion: meta.format_version };
  }

  let league;
  try {
    const res = await fetchImpl(`${feedBase}/league.json`);
    if (!res.ok) throw new Error(`league.json HTTP ${res.status}`);
    league = await res.json();
  } catch (e) {
    await stateRef.set({ lastError: `league: ${e.message}`, lastRunAt: nowIso() }, { merge: true });
    return { status: "fetch_error", error: e.message };
  }

  const [players, draftPicks, trades] = await Promise.all([
    db.collection("players").get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    db.collection("draftPicks").get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    db.collection("trades").get().then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
  ]);

  const report = diffSnapshot(league, { players, draftPicks, trades });

  await db.doc(REPORT_DOC).set({
    ...trimReport(report),
    feedLastChangedAt: meta.last_changed_at,
    reportedAt: nowIso(),
    mode: "report-only",
  });
  await stateRef.set({
    lastProcessedChangedAt: meta.last_changed_at,
    lastRunAt: nowIso(),
    lastError: null,
    lastSummary: summarize(report),
  }, { merge: true });

  // ── Phase 4: apply, when armed. config/ifflFeed.armed = {players, picks}.
  // Report-only remains the default for any flag left unset.
  const armed = {
    players: !!state.armed?.players,
    picks: !!state.armed?.picks,
    trades: !!state.armed?.trades,
  };
  let appliedLine = "Report-only — nothing was applied.";
  let applied = null;

  if ((armed.players || armed.picks || armed.trades) && report.problems.length === 0) {
    const plan = planApply(league, { players, draftPicks, trades }, armed, { nowMs: Date.parse(nowIso()) });
    if (!plan.ok) {
      appliedLine = `⛔ Apply refused: ${plan.reasons.slice(0, 3).join("; ")}`;
      await stateRef.set({ lastApplyError: plan.reasons.join("; ") }, { merge: true });
    } else {
      for (const w of plan.writes) {
        const ref = db.collection(w.col).doc(w.id);
        const fields = { ...w.fields };
        // Timestamp-typed fields ride the plan as epoch ms (the plan is
        // pure); they become real Timestamps here so Firestore's type-aware
        // ordering keeps feed-created docs sorted with everything else.
        for (const [k, ms] of Object.entries(w.tsFields ?? {})) fields[k] = tsFromMs(ms);
        if (w.op === "set") await ref.set(fields);
        else await ref.update(fields);
      }
      for (const row of plan.ledger) {
        await db.collection("transactions").doc().set({ ...row, createdAt: nowTs() });
      }
      applied = plan.counts;
      const c = plan.counts;
      appliedLine =
        `APPLIED: ${c.teamMoves} moves, ${c.deactivated} to FA, ${c.reactivated} back, ` +
        `${c.created} created, ${c.priceUpdates} prices, ${c.anchorUpdates} anchors, ${c.pickMoves} pick moves, ` +
        `trades ${c.tradesStamped} stamped/${c.tradesCreated} created/${c.tradesItemFilled} items filled.`;
      await stateRef.set({
        lastAppliedAt: nowIso(),
        lastAppliedCounts: c,
        lastApplyError: null,
      }, { merge: true });
    }
  }

  if (report.problems.length > 0) {
    await dm(`⛔ Feed sync hit problems:\n${report.problems.join("\n")}`);
  } else {
    await dm(`📥 League feed changed (${meta.last_changed_at}).\n${summarize(report)}\n${appliedLine}`);
  }

  return { status: "reported", summary: summarize(report), applied };
}

module.exports = { runFeedSync, STATE_DOC, REPORT_DOC };
