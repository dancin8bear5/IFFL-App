// tradeIngest — pure resolution logic for the ESPN trade auto-import
// webhook (see index.js exports.ingestEspnTrade). No Firebase deps, so
// this unit-tests clean; index.js wraps it with the actual Firestore
// reads/writes and idempotency check.
//
// Payload contract (what the Make.com scenario POSTs):
//   {
//     sourceId: "unique per source event — e.g. the Gmail message id",
//     tradeDate: "2026-08-14T18:32:00Z",   // optional
//     moves: [
//       { player: "Justin Jefferson", fromEspnTeam: "bill pony club", toEspnTeam: "Shoot the Moon: IV" },
//       ...
//     ],
//     rawText: "optional raw email text, kept for audit only",
//   }
// One entry per player that changed teams — this also just works for
// lopsided trades (2-for-1, etc.) and, if it ever happens, 3-team deals.

// ESPN team name -> master team name (Keeper Master p17 identity map).
// MUST stay in sync with web/src/data/staticData.js's `fantasyTeams`
// espnName fields — there is no shared module between the web app and
// Cloud Functions (different runtimes/deploys), so this is intentionally
// a second copy. Update both if the league ever renames an ESPN team.
const ESPN_TEAM_MAP = {
  "cinderella story": "A. Zurek",
  "horner park johnson-rods": "Abad",
  "bill pony club": "Bill",
  "aussie rookie ramblers": "Cantone",
  "cream of wheaton": "Dugan",
  "allegiant pots n pans": "Faybik",
  "wheaton creampeyes": "Foley",
  "shoot the moon: iv": "Jared",
  "the mojave miracles": "Jason",
  "meta knights": "M. Zurek",
  "the replacements": "Ryan",
  "river forest republicans": "Wayne",
};

function resolveEspnTeam(name) {
  return ESPN_TEAM_MAP[String(name ?? "").toLowerCase().trim()] ?? null;
}

/**
 * Structural + team-name validation of a raw webhook payload. Does NOT
 * touch Firestore — player-roster matching needs live data and happens
 * separately in matchPlayers(). Returns {ok, moves, error}.
 */
function validatePayload(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Empty or invalid body" };
  if (!body.sourceId || typeof body.sourceId !== "string" || !body.sourceId.trim()) {
    return { ok: false, error: "sourceId is required" };
  }
  if (!Array.isArray(body.moves) || body.moves.length === 0) {
    return { ok: false, error: "moves must be a non-empty array" };
  }

  const moves = [];
  for (let i = 0; i < body.moves.length; i++) {
    const m = body.moves[i];
    if (!m || !m.player || typeof m.player !== "string" || !m.player.trim()) {
      return { ok: false, error: `moves[${i}].player is required` };
    }
    const fromTeam = resolveEspnTeam(m.fromEspnTeam);
    const toTeam = resolveEspnTeam(m.toEspnTeam);
    if (!fromTeam) return { ok: false, error: `moves[${i}].fromEspnTeam "${m.fromEspnTeam}" not recognized` };
    if (!toTeam) return { ok: false, error: `moves[${i}].toEspnTeam "${m.toEspnTeam}" not recognized` };
    if (fromTeam === toTeam) return { ok: false, error: `moves[${i}]: fromEspnTeam and toEspnTeam resolve to the same team (${fromTeam})` };
    moves.push({ player: m.player.trim(), fromTeam, toTeam });
  }
  return { ok: true, moves };
}

/**
 * Match each validated move's player name against a live roster
 * snapshot — an array of {id, name, teamName} for the players currently
 * on the relevant teams. Case-insensitive exact match against the
 * player's CURRENT team (fromTeam), since that's what ESPN would show
 * as the trade's source.
 *
 * Every move must resolve to exactly one player for `ok` to be true —
 * a trade only auto-applies when every leg is unambiguous. Zero matches
 * or multiple matches both become a "problem" for human review rather
 * than a guess.
 */
function matchPlayers(moves, rosterSnapshot) {
  const resolved = [];
  const problems = [];
  for (const move of moves) {
    const candidates = rosterSnapshot.filter(
      (p) => p.teamName === move.fromTeam && p.name.toLowerCase().trim() === move.player.toLowerCase(),
    );
    if (candidates.length === 0) {
      problems.push({ ...move, reason: `"${move.player}" not found on ${move.fromTeam}'s roster` });
    } else if (candidates.length > 1) {
      problems.push({ ...move, reason: `"${move.player}" matched ${candidates.length} players on ${move.fromTeam} — ambiguous` });
    } else {
      resolved.push({ ...move, assetId: candidates[0].id, displayName: candidates[0].name });
    }
  }
  return { ok: problems.length === 0, resolved, problems };
}

/**
 * Pick a "proposer"/"receiver" pair for the trade doc's summary fields.
 * Almost every trade is 2 teams, so this is exact for the common case.
 * A rare 3+-team trade still transfers every move correctly (that logic
 * doesn't depend on this) — the two labels just describe the first pair
 * of teams touched, which is a display nicety, not a correctness one.
 */
function pickSides(resolvedMoves) {
  const proposingTeamName = resolvedMoves[0].fromTeam;
  const other = resolvedMoves.find((m) => m.fromTeam !== proposingTeamName);
  const receivingTeamName = other ? other.fromTeam : resolvedMoves[0].toTeam;
  return { proposingTeamName, receivingTeamName };
}

module.exports = { ESPN_TEAM_MAP, resolveEspnTeam, validatePayload, matchPlayers, pickSides };
