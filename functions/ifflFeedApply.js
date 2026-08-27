// ifflFeedApply — phase 4: turn a feed snapshot into Firestore writes.
//
// Pure planning: league.json + our docs in, a list of writes and ledger
// rows out. Execution lives in ifflFeedSync so the same plan is testable
// offline and applied identically in production.
//
// What the feed WINS (per the integration guide and the arming decision):
//   ownership (teamName / isActive), computed prices, contract anchors
//   (draft_year → purchaseYear, draft_price → originalPrice), and live
//   draft-pick ownership.
// What it never touches: tradeHistory via-notes, votes, avatars, and every
// app-native field. Used picks are excluded entirely — a spent pick's
// holder row is history, and the feed's own copy of it can be stale
// (see: the 1.02 that became Fernando Mendoza).
//
// No-guess doctrine: any ambiguity or team-mapping problem aborts the whole
// plan. A sync that applies 90% of a snapshot and guesses the rest is worse
// than one that stops and says why.

const { matchTeams, matchPlayers } = require("./ifflFeed");

/** Deterministic doc id for a feed-created player. */
const createdId = (ifflId) => `iffl-${ifflId}`;

/** Feed 'DST' → the app's 'D/ST' display convention; all else unchanged. */
const appPosition = (pos) => (pos === "DST" ? "D/ST" : pos);

const stringifyPrices = (prices) =>
  Object.fromEntries(
    Object.entries(prices ?? {})
      .filter(([, v]) => v != null)
      .map(([y, v]) => [String(y), v]),
  );

const pricesEqual = (a, b) => {
  const years = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const y of years) if ((a?.[y] ?? null) !== (b?.[y] ?? null)) return false;
  return true;
};

/**
 * Plan every write an armed sync should make. Returns
 *   { ok, reasons, writes: [{col, id, op, fields}], ledger: [rows], counts }
 * `armed` gates sections: {players: bool, picks: bool}.
 */
function planApply(league, ours, armed = { players: false, picks: false }) {
  const writes = [];
  const ledger = [];
  const counts = { teamMoves: 0, deactivated: 0, reactivated: 0, priceUpdates: 0, anchorUpdates: 0, created: 0, pickMoves: 0 };

  const teams = matchTeams(league.teams);
  if (teams.problems.length) {
    return { ok: false, reasons: teams.problems, writes, ledger, counts };
  }
  const teamName = (id) => (id != null ? teams.byIfflId.get(id)?.ourName ?? null : null);

  const pm = matchPlayers(league.players, ours.players);
  if (pm.ambiguous.length) {
    return {
      ok: false,
      reasons: pm.ambiguous.map((a) => `ambiguous player: ${a.feed.name} → ${a.candidates.join(", ")}`),
      writes, ledger, counts,
    };
  }

  const tx = (teamNameVal, playerId, playerName, note) => ledger.push({
    type: "adjust",
    teamName: teamNameVal,
    playerId,
    playerName,
    note,
    season: league.season ?? null,
    source: "iffl-feed",
    actorUid: null,
  });

  if (armed.players) {
    for (const { feed, ours: op } of pm.matched) {
      const feedTeam = teamName(feed.team_id);
      const fields = {};

      if (feedTeam == null && op.isActive !== false) {
        // Dropped upstream. Deactivate; the salary-follows/FAAB bookkeeping
        // is Jason's app's job now — mirroring outcomes, not rules.
        fields.isActive = false;
        counts.deactivated++;
        tx(op.teamName ?? null, op.id, op.name, "Feed sync — released to free agency (per ESPN)");
      } else if (feedTeam != null) {
        if (op.isActive === false) {
          fields.isActive = true;
          fields.teamName = feedTeam;
          counts.reactivated++;
          tx(feedTeam, op.id, op.name, `Feed sync — re-rostered by ${feedTeam}`);
        } else if (feedTeam !== op.teamName) {
          fields.teamName = feedTeam;
          counts.teamMoves++;
          tx(feedTeam, op.id, op.name, `Feed sync — moved ${op.teamName ?? "?"} → ${feedTeam} (per league feed)`);
        }
        const newPrices = stringifyPrices(feed.prices);
        if (!pricesEqual(newPrices, op.prices)) {
          fields.prices = newPrices;
          counts.priceUpdates++;
        }
        if (feed.draft_year != null && Number(feed.draft_year) !== Number(op.purchaseYear)) {
          fields.purchaseYear = Number(feed.draft_year);
          counts.anchorUpdates++;
        }
        if (feed.draft_price != null && Number(feed.draft_price) !== Number(op.originalPrice)) {
          fields.originalPrice = Number(feed.draft_price);
          counts.anchorUpdates++;
        }
      }

      if (Object.keys(fields).length) {
        writes.push({ col: "players", id: op.id, op: "update", fields });
      }
    }

    // Feed-rostered players we've never had — create with full shape.
    for (const fp of pm.unmatched.filter((p) => p.team_id != null)) {
      const team = teamName(fp.team_id);
      writes.push({
        col: "players",
        id: createdId(fp.id),
        op: "set",
        fields: {
          name: fp.name,
          position: appPosition(fp.position),
          teamName: team,
          nflTeam: null,
          prices: stringifyPrices(fp.prices),
          originalPrice: fp.draft_price ?? 0,
          purchaseYear: fp.draft_year ?? league.season ?? null,
          contractYearsRemaining: 1,
          playerPool: "Auction",
          tradeHistory: [],
          isActive: true,
          salaryStatus: "rostered",
          ifflId: fp.id,
          espnId: fp.espn_id ?? null,
        },
      });
      counts.created++;
      tx(team, createdId(fp.id), fp.name, `Feed sync — added to ${team}'s roster (per league feed)`);
    }
  }

  if (armed.picks) {
    const ourPickByKey = new Map();
    for (const p of ours.draftPicks ?? []) {
      ourPickByKey.set(`${p.season}|${p.round}|${p.originalTeamName}`, p);
    }
    for (const fp of league.draft_picks ?? []) {
      const orig = teamName(fp.original_team_id);
      const op = ourPickByKey.get(`${fp.pick_year}|${fp.pick_round}|${orig}`);
      // Only live picks: a used pick's holder row is history, and the
      // feed's copy of it can be stale without meaning anything.
      if (!op || op.status !== "available") continue;
      const feedCurrent = teamName(fp.current_team_id);
      if (feedCurrent && feedCurrent !== op.currentTeamName) {
        writes.push({ col: "draftPicks", id: op.id, op: "update", fields: { currentTeamName: feedCurrent } });
        counts.pickMoves++;
        tx(feedCurrent, op.id, `${fp.pick_year} R${fp.pick_round} (${orig})`,
          `Feed sync — pick moved ${op.currentTeamName} → ${feedCurrent} (per league feed)`);
      }
    }
  }

  return { ok: true, reasons: [], writes, ledger, counts };
}

module.exports = { planApply, createdId, appPosition };
