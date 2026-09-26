// tradeReconcile — cross-check an ESPN email trade against GroupMe intent.
// Pure logic, no Firebase deps.
//
// PLAN B (commissioner decision, 2026-08-16):
//   Any pick present, OR any disagreement between the ESPN email and the
//   GroupMe signal, HOLDS THE ENTIRE TRADE for human review. We never
//   auto-transfer the players while silently dropping a pick — that was
//   exactly today's trap (Dak/Turpin auto-applied, 2027 2nd lost).
//
// Inputs:
//   espn  = { ok, moves:[{player, fromTeam, toTeam}], meta } (espnEmailParser)
//   gm    = a GroupMe signal group's `extracted` { picks, teams, directionPhrases }
//           plus optional `text`. May be null if no GroupMe signal was found.
//
// Output:
//   {
//     decision: "auto-eligible" | "hold-for-review" | "reject",
//     reasons: [ ... human-readable ... ],
//     espnMoves, picks, teams,
//   }
//
// "auto-eligible" only means the PLAYER side is clean AND there is no pick
// and no cross-source conflict. The caller still validates against live
// rosters before executing. Anything else → hold.

function reconcile(espn, gm) {
  const reasons = [];
  // Individually actionable flags. The caller decides what each one means:
  // a pick is something to attach afterwards, a source disagreement is a
  // reason to stop, and missing chatter is neither. Collapsing them all
  // into one "hold" made every quiet trade need hand-entry.
  const flags = {picks: false, teamMismatch: false, extraTeams: false, noCorroboration: false};

  if (!espn || !espn.ok) {
    return {
      decision: "reject",
      reasons: [`ESPN email did not parse: ${espn?.error ?? "no espn input"}`],
      flags: {picks: false, teamMismatch: false, extraTeams: false, noCorroboration: false},
      espnMoves: [],
      picks: [],
      teams: [],
    };
  }

  const espnMoves = espn.moves;
  const espnTeams = [...new Set(espnMoves.flatMap((m) => [m.fromTeam, m.toTeam]))].sort();
  const picks = (gm && gm.picks) || [];
  const gmTeams = ((gm && gm.teams) || []).slice().sort();

  let hold = false;

  // Rule 1: ANY pick → hold. ESPN emails never contain picks, so a pick can
  // only come from GroupMe, and it can never be auto-verified against ESPN.
  if (picks.length > 0) {
    hold = true;
    flags.picks = true;
    const desc = picks
      .map((p) => `${p.year ?? "?"} R${p.round}`)
      .join(", ");
    reasons.push(`Draft pick(s) present in GroupMe but not in ESPN email: ${desc} — must be applied manually`);
  }

  // Rule 2: team-set mismatch between the two sources → hold.
  // Only checked when GroupMe actually named resolvable teams.
  if (gmTeams.length > 0) {
    const sameTeams =
      gmTeams.length === espnTeams.length &&
      gmTeams.every((t, i) => t === espnTeams[i]);
    if (!sameTeams) {
      hold = true;
      flags.teamMismatch = true;
      reasons.push(
        `Team mismatch: ESPN email involves [${espnTeams.join(", ")}] but GroupMe named [${gmTeams.join(", ")}]`,
      );
    }
  }

  // Rule 3: if GroupMe direction phrases exist, sanity-check they don't
  // CONTRADICT the ESPN direction. GroupMe chat direction is often shorthand
  // /scrambled (today's post reversed it), so a contradiction → hold, not reject.
  if (gm && Array.isArray(gm.directionPhrases) && gm.directionPhrases.length > 0) {
    // We can't reliably map chat player references without NLP; treat the
    // mere presence of GroupMe direction context as informational unless the
    // team-set already flagged. This keeps us from auto-applying when the
    // human chatter and the official record disagree in ANY way.
    const gmTeamSet = new Set(gm.directionPhrases.map((d) => d.team));
    const espnTeamSet = new Set(espnTeams);
    const extraGmTeams = [...gmTeamSet].filter((t) => !espnTeamSet.has(t));
    if (extraGmTeams.length > 0) {
      hold = true;
      flags.extraTeams = true;
      reasons.push(
        `GroupMe references team(s) not in the ESPN trade: ${extraGmTeams.join(", ")}`,
      );
    }
  }

  // Rule 4: no GroupMe signal at all for an ESPN trade → hold (soft).
  // A real trade almost always gets a 🚨. A silent ESPN trade with no chat
  // corroboration is unusual enough to eyeball once.
  if (!gm) {
    hold = true;
    flags.noCorroboration = true;
    reasons.push("No matching GroupMe signal found for this ESPN trade — no human corroboration");
  }

  if (hold) {
    return { decision: "hold-for-review", reasons, flags, espnMoves, picks, teams: espnTeams };
  }

  reasons.push("ESPN players clean, no picks, no cross-source conflict — eligible for auto-apply after roster validation");
  return { decision: "auto-eligible", reasons, flags, espnMoves, picks, teams: espnTeams };
}

module.exports = { reconcile };
