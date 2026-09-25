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

const { matchTeams, matchPlayers, normalizeName } = require("./ifflFeed");
const { abbrevFromProTeamId, normalizeNflTeam } = require("./nflTeams");

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
function planApply(league, ours, armed = { players: false, picks: false, trades: false }, opts = {}) {
  const nowMs = opts.nowMs ?? 0;
  const writes = [];
  const ledger = [];
  const counts = {
    teamMoves: 0, deactivated: 0, reactivated: 0, priceUpdates: 0, anchorUpdates: 0, created: 0, pickMoves: 0,
    tradesStamped: 0, tradesItemFilled: 0, tradesCreated: 0, nflTeamFixes: 0,
  };

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
        // NFL team, from the feed's pro_team_id — the one authority that is
        // complete and can't drift. Comparing against the RAW stored value
        // (not the normalized one) is what makes this fix formatting too:
        // "Kansas City Chiefs" differs from "KC", so it gets rewritten once
        // and then matches forever.
        const nfl = abbrevFromProTeamId(feed.pro_team_id);
        if (nfl && op.nflTeam !== nfl) {
          fields.nflTeam = nfl;
          counts.nflTeamFixes++;
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
          nflTeam: abbrevFromProTeamId(fp.pro_team_id),
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

  if (armed.trades) {
    planTrades(league, ours, { teamName, pm, writes, counts, nowMs });
  }

  return { ok: true, reasons: [], writes, ledger, counts };
}

/**
 * Trades: adopt-don't-duplicate, then backfill.
 *
 * A matched trade gets ifflTradeId stamped so it self-matches forever; if
 * the feed lists items ours lacks (picks, usually), they're appended to the
 * correct side as refs — no asset moves here, the players/picks sections
 * already own state. An unmatched feed trade is created outright:
 * older than a week as 'historical' (silent by onTradeWrite's gating),
 * recent as 'completed' (notifies normally). Nothing of ours is ever
 * overwritten — sides only ever gain items.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAIR_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const asDate = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null);

function planTrades(league, ours, ctx) {
  const { teamName, pm, writes, counts, nowMs } = ctx;
  const ourDone = (ours.trades ?? []).filter((t) => t.status === "completed" || t.status === "historical");
  const ourByIfflTradeId = new Map(ourDone.filter((t) => t.ifflTradeId != null).map((t) => [Number(t.ifflTradeId), t]));
  const feedPlayerById = new Map((league.players ?? []).map((p) => [p.id, p]));
  const feedPickById = new Map((league.draft_picks ?? []).map((p) => [p.id, p]));
  const oursByFeedId = new Map(pm.matched.map((m) => [m.feed.id, m.ours]));
  const claimed = new Set();
  const pairKey = (a, b) => [a, b].sort().join("::");

  // A feed item as one of our asset refs. Players we track get real ids;
  // anyone gone from our DB (2025-season names) rides as displayName-only,
  // the same shape the keeper-sheet backfill established.
  const toRef = (item) => {
    if (item.player_id != null) {
      const fp = feedPlayerById.get(item.player_id);
      const op = fp ? oursByFeedId.get(fp.id) : null;
      return { assetId: op?.id ?? null, assetType: "player", displayName: fp?.name ?? `player#${item.player_id}` };
    }
    const pick = feedPickById.get(item.draftpick_id);
    const orig = pick ? teamName(pick.original_team_id) : null;
    return {
      assetId: null,
      assetType: "draftPick",
      displayName: pick ? `${pick.pick_year} R${pick.pick_round}${orig ? ` (${orig})` : ""}` : `pick#${item.draftpick_id}`,
      pickYear: pick?.pick_year ?? null,
      pickRound: pick?.pick_round ?? null,
    };
  };

  // Is a feed item already represented on the trade? By asset id when we
  // have one, else by name/pick-shape against the existing display names.
  const covered = (ref, ourItems) => {
    if (ref.assetId && ourItems.some((i) => i.assetId === ref.assetId)) return true;
    if (ref.assetType === "player") {
      const n = normalizeName(ref.displayName);
      return ourItems.some((i) => normalizeName(i.displayName ?? "") === n);
    }
    const y = String(ref.pickYear ?? "");
    const r = String(ref.pickRound ?? "");
    // Every notation this league has actually used for "round N": the feed's
    // "R1", the app's "Round 1", the sheet's ordinal "1st", and the sheet's
    // resolved slot form "1.02" — whose leading digit IS the round. Missing
    // that last one is how the first armed run appended four duplicate pick
    // refs onto the two 4/2 trades.
    const roundRe = new RegExp(`(\\b(R${r}|Round ${r}|${r}(st|nd|rd|th))\\b|\\b${r}\\.\\d{2}\\b)`, "i");
    return ourItems.some((i) => {
      const d = String(i.displayName ?? "");
      return i.assetType !== "player" && d.includes(y) && roundRe.test(d);
    });
  };

  for (const ft of league.trades ?? []) {
    const items = ft.items ?? [];
    if (!items.length) continue;
    const senders = items.map((i) => teamName(i.sender_team_id));
    const receivers = items.map((i) => teamName(i.receiver_team_id));
    const teams = [...new Set([...senders, ...receivers])].filter(Boolean);
    if (teams.length !== 2) continue; // guide guarantees two; anything else is not ours to guess
    const when = new Date(`${ft.trade_date}T12:00:00`);

    let adopted = ourByIfflTradeId.get(ft.id) ?? null;
    if (!adopted) {
      adopted = ourDone
        .filter((t) => !claimed.has(t.id) && t.ifflTradeId == null &&
          pairKey(t.proposingTeamName, t.receivingTeamName) === pairKey(teams[0], teams[1]) &&
          asDate(t.date) && Math.abs(asDate(t.date) - when) <= PAIR_WINDOW_MS)
        .sort((a, b) => Math.abs(asDate(a.date) - when) - Math.abs(asDate(b.date) - when))[0] ?? null;
      if (adopted) counts.tradesStamped++;
    }

    if (adopted) {
      claimed.add(adopted.id);
      const fields = {};
      if (adopted.ifflTradeId == null) fields.ifflTradeId = ft.id;

      const proposerItems = [...(adopted.assetsFromProposer ?? [])];
      const receiverItems = [...(adopted.assetsFromReceiver ?? [])];
      const all = [...proposerItems, ...receiverItems];
      let filled = 0;
      for (const item of items) {
        const ref = toRef(item);
        if (covered(ref, all)) continue;
        const sender = teamName(item.sender_team_id);
        const { pickYear, pickRound, ...clean } = ref;
        if (sender === adopted.proposingTeamName) proposerItems.push(clean);
        else receiverItems.push(clean);
        all.push(ref);
        filled++;
      }
      if (filled > 0) {
        fields.assetsFromProposer = proposerItems;
        fields.assetsFromReceiver = receiverItems;
        counts.tradesItemFilled += filled;
      }
      if (Object.keys(fields).length) {
        writes.push({ col: "trades", id: adopted.id, op: "update", fields });
      }
      continue;
    }

    // Never seen: create it. The proposer label is the first item's sender —
    // a display nicety, same convention as the ESPN ingest's pickSides.
    const proposing = senders.find(Boolean);
    const receiving = teams.find((t) => t !== proposing);
    const refs = items.map((i) => ({ item: i, ref: toRef(i) }));
    const clean = ({ pickYear, pickRound, ...r }) => r;
    const isOld = nowMs - when.getTime() > WEEK_MS;
    writes.push({
      col: "trades",
      id: `iffl-trade-${ft.id}`,
      op: "set",
      fields: {
        proposingTeamName: proposing,
        receivingTeamName: receiving,
        assetsFromProposer: refs.filter((x) => teamName(x.item.sender_team_id) === proposing).map((x) => clean(x.ref)),
        assetsFromReceiver: refs.filter((x) => teamName(x.item.sender_team_id) !== proposing).map((x) => clean(x.ref)),
        notes: null,
        season: ft.trade_season ?? null,
        status: isOld ? "historical" : "completed",
        source: "iffl-feed",
        ifflTradeId: ft.id,
      },
      tsFields: { date: when.getTime(), completedAt: when.getTime() },
    });
    counts.tradesCreated++;
  }
}

module.exports = { planApply, createdId, appPosition };
