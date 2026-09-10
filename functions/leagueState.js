/**
 * leagueState — one authenticated GET that returns the whole league in a
 * stable envelope, so agents never query Firestore directly and a schema
 * change here does not break every consumer at once.
 *
 * Consumed by the Agent Control Center on the NAS (job `iffl-snapshot`),
 * which is stdlib-only Python on a Synology and cannot do service-account
 * auth — hence a shared-secret header rather than IAM.
 *
 * Shared secret — set once from the Mac terminal:
 *   firebase functions:secrets:set IFFL_EXPORT_KEY
 * Generate it with e.g. `openssl rand -hex 32`. Never lives in git, the app
 * bundle, or Firestore. The NAS sends it back on every call as x-iffl-key.
 *
 *   # daily state (default)
 *   curl -H "x-iffl-key: $KEY" ".../leagueState?since=2026-08-26T00:00:00Z"
 *   # static history corpus — pull once, not daily
 *   curl -H "x-iffl-key: $KEY" ".../leagueState?set=archive"
 */
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

const IFFL_EXPORT_KEY = defineSecret("IFFL_EXPORT_KEY");

// index.js owns admin.initializeApp(); requires run before it, so resolve
// Firestore lazily rather than at module load.
const db = () => admin.firestore();

/**
 * Collections split by how often they change.
 *   daily   — league state worth pulling every morning
 *   archive — static history; large, and pointless to refetch daily
 *
 * `since` names the timestamp field for the 24h delta. Confirmed on
 * iffl-trade-1: trades use `completedAt` (and a duplicate `date`); there is
 * no `createdAt` anywhere. Collections whose field names are still unknown
 * are left unfiltered rather than guessed — a full capped fetch is always
 * correct, where a wrong `since` silently returns nothing.
 *
 * Excluded on purpose: espnGmailSeen (dedupe bookkeeping), teamAvatars
 * (images), userSettings (UI prefs), playerFMK, playerInterests,
 * parlayEntries (side games).
 */
const COLLECTIONS = {
  Users: {path: "Users", set: "daily"},
  config: {path: "config", set: "daily"},
  rules: {path: "rules", set: "daily"},
  seasons: {path: "seasons", set: "daily"},
  players: {path: "players", set: "daily", maxDocs: 4000},
  keeperPlans: {path: "keeperPlans", set: "daily"},
  draftPicks: {path: "draftPicks", set: "daily"},
  bigBoard: {path: "bigBoard", set: "daily"},
  leagueRecords: {path: "leagueRecords", set: "daily"},
  trades: {path: "trades", set: "daily", since: "completedAt"},
  tradeIngests: {path: "tradeIngests", set: "daily"},
  transactions: {path: "transactions", set: "daily"},
  groupmeTradeSignals: {path: "groupmeTradeSignals", set: "daily"},
  weeklyScores: {path: "weeklyScores", set: "daily", maxDocs: 1000},
  espnLiveScores: {path: "espnLiveScores", set: "daily"},

  leagueHistory: {path: "leagueHistory", set: "archive"},
  historyAggregates: {path: "historyAggregates", set: "archive"},
  historyDrafts: {path: "historyDrafts", set: "archive", maxDocs: 5000},
  historyMatchups: {path: "historyMatchups", set: "archive", maxDocs: 5000},
  historyTeamSeasons: {path: "historyTeamSeasons", set: "archive", maxDocs: 5000},
  historyPlayerSeasons: {path: "historyPlayerSeasons", set: "archive", maxDocs: 20000},
  historyPlayerWeeks: {path: "historyPlayerWeeks", set: "archive", maxDocs: 50000},
};

const MAX_DOCS = 2000;
const SETS = ["daily", "archive", "all"];

exports.leagueState = onRequest(
    {secrets: [IFFL_EXPORT_KEY], timeoutSeconds: 300, memory: "512MiB"},
    async (req, res) => {
      const provided = String(req.get("x-iffl-key") || "");
      const expected = String(IFFL_EXPORT_KEY.value() || "");
      // Length check first so the comparison cannot leak length through timing.
      if (!expected || provided.length !== expected.length || provided !== expected) {
        res.status(401).json({error: "unauthorized"});
        return;
      }

      const set = String(req.query.set || "daily").toLowerCase();
      if (!SETS.includes(set)) {
        res.status(400).json({error: `set must be one of ${SETS.join(", ")}`});
        return;
      }

      const since = parseSince(req.query.since);
      const out = {
        generatedAt: new Date().toISOString(),
        since: since ? since.toISOString() : null,
        set,
        source: "iffl-auth/leagueState",
        version: 1,
        data: {},
        counts: {},
        warnings: [],
      };

      for (const [key, spec] of Object.entries(COLLECTIONS)) {
        if (set !== "all" && spec.set !== set) continue;
        try {
          out.data[key] = await readCollection(spec, since, out.warnings, key);
          out.counts[key] = out.data[key].length;
        } catch (err) {
          // One bad collection must not cost the caller the other twenty.
          out.warnings.push(`${key}: ${err.message}`);
          out.data[key] = [];
          out.counts[key] = 0;
        }
      }

      res.set("Cache-Control", "no-store");
      res.status(200).json(out);
    });

async function readCollection(spec, since, warnings, key) {
  const cap = spec.maxDocs || MAX_DOCS;
  const base = db().collection(spec.path);
  const useSince = Boolean(since && spec.since);

  const docs = await fetchDocs(
      useSince ?
        base.where(spec.since, ">=", admin.firestore.Timestamp.fromDate(since)) :
        base,
      cap, warnings, key);

  // A filter on a field that does not exist returns zero rows rather than an
  // error — indistinguishable from "nothing happened yesterday". But a quiet
  // day looks identical, so probe before crying wolf: orderBy on a field no
  // document carries returns nothing, while a real field returns a doc even
  // when none fall inside the window. One extra read, and it keeps a quiet
  // league quiet instead of replaying the entire trade history every morning.
  if (useSince && docs.length === 0) {
    const probe = await base.orderBy(spec.since).limit(1).get();
    if (probe.empty) {
      const all = await fetchDocs(base, cap, warnings, key);
      if (all.length > 0) {
        warnings.push(
            `${key}: no document carries since-field "${spec.since}" but ` +
            `${all.length} rows exist — field name is wrong; returning unfiltered`);
        return all;
      }
      warnings.push(`${key}: empty (collection has no documents)`);
    }
    // Field exists and nothing landed in the window: correct, and quiet.
  }
  return docs;
}

async function fetchDocs(query, cap, warnings, key) {
  const snap = await query.limit(cap + 1).get();
  if (snap.size > cap) {
    warnings.push(`${key}: truncated at ${cap} docs`);
  }
  return snap.docs.slice(0, cap).map((d) => ({id: d.id, ...normalize(d.data())}));
}

/** Timestamps, refs and GeoPoints are not JSON — flatten for stdlib parsing. */
function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (value instanceof admin.firestore.GeoPoint) {
    return {lat: value.latitude, lng: value.longitude};
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function parseSince(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}
