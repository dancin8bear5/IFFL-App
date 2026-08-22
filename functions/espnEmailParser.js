// espnEmailParser — parse an ESPN "trade accepted" email body into a
// structured player trade. Pure logic, no Firebase deps.
//
// Confirmed email format (2026-08-16 fixture):
//   The following trade has been accepted in your ESPN Fantasy Football
//   league Insanity League.
//   To: Shoot the Moon: IV
//   From: The Mojave Miracles
//   MOON trades
//   Dak Prescott, QB (DAL)
//   CATS trades
//   KaVontae Turpin, WR (DAL)
//   ... ESPN boilerplate ...
//
// CRITICAL DIRECTION RULE:
//   "MOON trades Dak" means MOON *SENDS* Dak (Dak leaves MOON).
//   The To:/From: header lines are a DECOY — do NOT derive direction from
//   them. Direction comes ONLY from the "<ABBREV> trades <player>" blocks.
//   Downstream MUST still validate against live rosters before executing.
//
// Team identity: the "<ABBREV> trades" headers use the `abbrev` slug
// (MOON, CATS, ...). We resolve those via the shared TEAMS map. The
// To:/From: full espnNames are parsed too, but only kept as metadata.

const { TEAMS } = require("./groupmeParser");

const ABBREV_TO_NAME = {};
const ESPNNAME_TO_NAME = {};
for (const t of TEAMS) {
  ABBREV_TO_NAME[t.abbrev.toLowerCase()] = t.name;
  ESPNNAME_TO_NAME[t.espnName.toLowerCase()] = t.name;
}

function resolveAbbrev(slug) {
  return ABBREV_TO_NAME[String(slug ?? "").toLowerCase().trim()] ?? null;
}
function resolveEspnName(name) {
  return ESPNNAME_TO_NAME[String(name ?? "").toLowerCase().trim()] ?? null;
}

const ACCEPTED_ANCHOR = /the following trade has been accepted/i;

/**
 * Parse an ESPN trade-accepted email body (plain text or lightly-marked).
 * Returns:
 *   { ok: true, moves: [{player, fromTeam, toTeam}], meta: {...} }
 * or
 *   { ok: false, error, meta }
 *
 * moves direction: fromTeam = the team whose "<ABBREV> trades" block the
 * player appeared under (they SEND); toTeam = the OTHER team in the deal.
 * Only handles the common 2-team trade explicitly; a 3-team email would
 * flag ok:false for human review rather than guess the "other" side.
 */
function parseEspnTradeEmail(body) {
  const meta = { league: null, to: null, from: null, rawBlocks: [] };
  if (!body || typeof body !== "string") {
    return { ok: false, error: "Empty or non-string body", meta };
  }
  if (!ACCEPTED_ANCHOR.test(body)) {
    return { ok: false, error: "Not a trade-accepted email (anchor phrase missing)", meta };
  }

  // Strip markdown link wrappers [text](url) -> text, and normalize.
  const clean = body.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const lines = clean.split(/\r?\n/).map((l) => l.replace(/\*+/g, "").trim()).filter(Boolean);

  // League / To / From (metadata only — NOT used for direction).
  const leagueLine = lines.find((l) => /league\s+.+\.?$/i.test(l) && ACCEPTED_ANCHOR.test(l));
  if (leagueLine) {
    const mm = leagueLine.match(/league\s+(.+?)\.?$/i);
    if (mm) meta.league = mm[1].trim();
  }
  for (const l of lines) {
    const mTo = l.match(/^To:\s*(.+)$/i);
    const mFrom = l.match(/^From:\s*(.+)$/i);
    if (mTo) meta.to = mTo[1].trim();
    if (mFrom) meta.from = mFrom[1].trim();
  }

  // Walk the "<ABBREV> trades" blocks. Each header is followed by one or
  // more player lines "Name, POS (NFL)" until the next header/boilerplate.
  // Boilerplate starts around "ESPN Fantasy App" / "FOLLOW US" / the
  // "This email was sent" line — stop parsing players there.
  const BOILERPLATE = /espn fantasy app|follow us|this email was sent|internet ventures|download the/i;
  const HEADER = /^([A-Za-z0-9.]+)\s+trades\b/i;
  const PLAYER = /^(.+?),\s*([A-Z]{1,3})\s*\(([A-Z]{2,3}|FA)\)\s*$/;

  const blocks = []; // { abbrev, team, players: [name] }
  let current = null;
  for (const l of lines) {
    if (BOILERPLATE.test(l)) break;
    const h = l.match(HEADER);
    if (h) {
      const abbrev = h[1];
      const team = resolveAbbrev(abbrev);
      current = { abbrev, team, players: [] };
      blocks.push(current);
      meta.rawBlocks.push(l);
      continue;
    }
    if (current) {
      const p = l.match(PLAYER);
      if (p) current.players.push(p[1].trim());
    }
  }

  const realBlocks = blocks.filter((b) => b.players.length > 0);
  if (realBlocks.length === 0) {
    return { ok: false, error: "No '<ABBREV> trades' player blocks found", meta };
  }
  const unresolved = realBlocks.filter((b) => !b.team);
  if (unresolved.length > 0) {
    return {
      ok: false,
      error: `Unrecognized team abbrev(s): ${unresolved.map((b) => b.abbrev).join(", ")}`,
      meta,
    };
  }
  if (realBlocks.length !== 2) {
    return {
      ok: false,
      error: `Expected exactly 2 trading teams, found ${realBlocks.length} — needs human review`,
      meta,
    };
  }

  const [A, B] = realBlocks;
  const moves = [];
  for (const name of A.players) moves.push({ player: name, fromTeam: A.team, toTeam: B.team });
  for (const name of B.players) moves.push({ player: name, fromTeam: B.team, toTeam: A.team });

  return { ok: true, moves, meta };
}

module.exports = { parseEspnTradeEmail, resolveAbbrev, resolveEspnName };
