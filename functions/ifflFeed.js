// ifflFeed — pure matching + diff logic for consuming Jason's league data
// feed (www.insanityleague.com JSON export). No Firebase deps, no fetch —
// feed JSON and our Firestore snapshots go in, a structured diff plan comes
// out. The IO lives in scripts/iffl-feed-dryrun.js (local, read-only) and,
// once armed, a scheduled Cloud Function.
//
// The feed's integration guide (jason-to-jared-export-guide.md) is the
// contract this implements. The rules that matter most:
//
//   - Match teams by `owner`, never `name` — team names change, owners don't.
//   - Match players by normalized name ONCE, then only ever by stored id.
//   - The feed's computed `prices` are authoritative — never reimplement
//     the contract formula.
//   - Snapshot semantics: absent from the snapshot means deleted upstream.
//   - format_version > 1 → stop and flag, never guess at a new shape.

/**
 * Feed `owner` → our master team name. The feed identifies humans by first
 * name ("Matt", "Mike D."); our whole app keys on the master names from
 * staticData ("M. Zurek", "Dugan"). Twelve rows, fixed — owners are the
 * stable identity on BOTH sides, so this map should never change while the
 * league's membership doesn't.
 */
const OWNER_TO_TEAM = {
  "Jared": "Jared",
  "Jason": "Jason",
  "Bill": "Bill",
  "Ryan": "Ryan",
  "Wayne": "Wayne",
  "Matt": "M. Zurek",
  "Andrew": "A. Zurek",
  "Mike D.": "Dugan",
  "Mike F.": "Faybik",
  "Brett": "Foley",
  "Josh": "Cantone",
  "Corey": "Abad",
};

const SUFFIX_TOKENS = new Set(["jr", "sr", "ii", "iii", "iv", "v", "dst"]);

/**
 * The feed guide's normalization, implemented exactly — it matched 376/380
 * when Jason's app did this same exercise against ESPN, so we inherit both
 * the algorithm and its track record:
 *   lowercase → "d/st"→"dst" → non-alnum runs→space → drop suffix tokens
 *   (jr, sr, ii, iii, iv, v, dst) → remove whitespace.
 */
function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/d\/st/g, "dst")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((tok) => tok && !SUFFIX_TOKENS.has(tok))
    .join("");
}

/** 'D/ST' and 'DST' are the same position; everything else is already clean. */
function normalizePosition(pos) {
  return String(pos ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/**
 * Resolve the feed's 12 teams to our master names. Fails loudly on any
 * owner the map doesn't know — a 13th owner or a renamed one is a league
 * membership change, which a human should hear about before any import.
 */
function matchTeams(feedTeams) {
  const byIfflId = new Map();
  const problems = [];
  for (const t of feedTeams ?? []) {
    const ourName = OWNER_TO_TEAM[t.owner];
    if (!ourName) {
      problems.push(`Feed owner "${t.owner}" (team "${t.name}") is not in the owner map`);
      continue;
    }
    byIfflId.set(t.id, { ourName, owner: t.owner, feedName: t.name, espnTeamId: t.espn_team_id });
  }
  const mapped = new Set([...byIfflId.values()].map((v) => v.ourName));
  if (mapped.size !== byIfflId.size) problems.push("Two feed owners mapped to the same team");
  return { byIfflId, problems };
}

/**
 * Match every feed player to at most one of our player docs.
 *
 * Precedence: stored ifflId (exact, post-onboarding) → stored espnId →
 * normalized name + position → normalized name alone when unique. Anything
 * ambiguous lands in a report bucket rather than being guessed — the same
 * no-guess doctrine as the trade ingest.
 */
function matchPlayers(feedPlayers, ourPlayers) {
  const oursByIfflId = new Map();
  const oursByEspnId = new Map();
  const oursByNamePos = new Map(); // norm|pos → [docs]
  const oursByName = new Map(); // norm → [docs]

  for (const p of ourPlayers ?? []) {
    if (p.ifflId != null) oursByIfflId.set(Number(p.ifflId), p);
    if (p.espnId != null) oursByEspnId.set(Number(p.espnId), p);
    const n = normalizeName(p.name);
    const key = `${n}|${normalizePosition(p.position)}`;
    if (!oursByNamePos.has(key)) oursByNamePos.set(key, []);
    oursByNamePos.get(key).push(p);
    if (!oursByName.has(n)) oursByName.set(n, []);
    oursByName.get(n).push(p);
  }

  const matched = []; // {feed, ours, via}
  const ambiguous = []; // {feed, candidates}
  const unmatched = []; // feed players with no counterpart

  for (const fp of feedPlayers ?? []) {
    const stored = oursByIfflId.get(fp.id);
    if (stored) { matched.push({ feed: fp, ours: stored, via: "ifflId" }); continue; }
    const byEspn = fp.espn_id != null ? oursByEspnId.get(Number(fp.espn_id)) : null;
    if (byEspn) { matched.push({ feed: fp, ours: byEspn, via: "espnId" }); continue; }

    const n = normalizeName(fp.name);
    const posKey = `${n}|${normalizePosition(fp.position)}`;
    const posHits = oursByNamePos.get(posKey) ?? [];
    if (posHits.length === 1) { matched.push({ feed: fp, ours: posHits[0], via: "name+pos" }); continue; }
    if (posHits.length > 1) {
      // Prefer the active doc; two ACTIVE docs with one name is our data
      // problem to fix, not something to pick from.
      const active = posHits.filter((p) => p.isActive !== false);
      if (active.length === 1) { matched.push({ feed: fp, ours: active[0], via: "name+pos(active)" }); continue; }
      ambiguous.push({ feed: fp, candidates: posHits.map((p) => p.id) });
      continue;
    }
    const nameHits = oursByName.get(n) ?? [];
    if (nameHits.length === 1) { matched.push({ feed: fp, ours: nameHits[0], via: "name" }); continue; }
    if (nameHits.length > 1) { ambiguous.push({ feed: fp, candidates: nameHits.map((p) => p.id) }); continue; }
    unmatched.push(fp);
  }

  const matchedOurIds = new Set(matched.map((m) => m.ours.id));
  const oursUnmatched = (ourPlayers ?? []).filter(
    (p) => p.isActive !== false && !matchedOurIds.has(p.id),
  );

  return { matched, ambiguous, unmatched, oursUnmatched };
}

/** prices maps compare: {"2026": 31} vs {"2026": 31}. null and missing agree. */
function priceDiffs(feedPrices, ourPrices) {
  const diffs = [];
  const years = new Set([...Object.keys(feedPrices ?? {}), ...Object.keys(ourPrices ?? {})]);
  for (const y of years) {
    const f = feedPrices?.[y] ?? null;
    const o = ourPrices?.[y] ?? null;
    if (f !== o) diffs.push({ year: y, feed: f, ours: o });
  }
  return diffs;
}

/**
 * The full dry-run diff: everything an armed sync WOULD do, as a report.
 *
 * `feed` is parsed league.json. `ours` is {players, draftPicks, trades}
 * from Firestore (plain objects with `id`). Nothing here mutates anything.
 */
function diffSnapshot(feed, ours) {
  const report = {
    generatedFrom: {
      feedLastChanged: feed.last_changed_at,
      feedSeason: feed.season,
      formatVersion: feed.format_version,
    },
    problems: [],
    teams: null,
    players: {
      matchedCount: 0,
      matchVia: {},
      teamChanges: [], // rostered here, different (or no) owner there
      becameFreeAgent: [], // ours active, feed says team_id null
      priceMismatches: [],
      anchorMismatches: [], // draft_year/draft_price vs purchaseYear/originalPrice
      toCreate: [], // feed-rostered, unknown to us
      ambiguous: [],
      oursUnmatched: [], // our active players the feed doesn't know — review, not delete
      feedFreeAgentsIgnored: 0, // FAs we don't track and won't create
    },
    picks: { ownershipChanges: [], oursUnmatched: [], feedUnmatched: [] },
    trades: { adopted: [], adoptedNeedingItems: [], newFromFeed: [], oursUnmatched: [] },
  };

  if ((feed.format_version ?? 0) > 1) {
    report.problems.push(`format_version ${feed.format_version} > 1 — refusing to plan an import`);
    return report;
  }

  // ── Teams ──
  const teams = matchTeams(feed.teams);
  report.problems.push(...teams.problems);
  report.teams = [...teams.byIfflId.entries()].map(([id, v]) => ({ ifflTeamId: id, ...v }));
  const teamName = (ifflTeamId) => teams.byIfflId.get(ifflTeamId)?.ourName ?? null;

  // ── Players ──
  const rostered = (feed.players ?? []).filter((p) => p.team_id != null);
  const freeAgents = (feed.players ?? []).filter((p) => p.team_id == null);
  const pm = matchPlayers(feed.players, ours.players);
  report.players.matchedCount = pm.matched.length;
  for (const m of pm.matched) {
    report.players.matchVia[m.via] = (report.players.matchVia[m.via] ?? 0) + 1;
  }
  report.players.ambiguous = pm.ambiguous.map((a) => ({
    feedName: a.feed.name, feedId: a.feed.id, candidates: a.candidates,
  }));
  report.players.oursUnmatched = pm.oursUnmatched.map((p) => ({ id: p.id, name: p.name, teamName: p.teamName }));
  // Feed-only players: only rostered ones would be created. The ~167 FAs are
  // deliberately not imported — our model tracks rostered players, and the
  // FA pool arriving as docs would just be noise until a feature wants it.
  report.players.toCreate = pm.unmatched
    .filter((p) => p.team_id != null)
    .map((p) => ({ ifflId: p.id, espnId: p.espn_id, name: p.name, position: p.position, team: teamName(p.team_id) }));
  report.players.feedFreeAgentsIgnored = freeAgents.filter(
    (p) => !pm.matched.some((m) => m.feed.id === p.id),
  ).length;

  for (const { feed: fp, ours: op } of pm.matched) {
    const feedTeam = fp.team_id != null ? teamName(fp.team_id) : null;
    if (feedTeam == null && op.isActive !== false && op.teamName) {
      report.players.becameFreeAgent.push({ id: op.id, name: op.name, from: op.teamName, becameFaAt: fp.became_free_agent_at });
      continue; // price rows for FAs are all-null; no point double-reporting
    }
    if (feedTeam != null && feedTeam !== op.teamName) {
      report.players.teamChanges.push({ id: op.id, name: op.name, ours: op.teamName ?? null, feed: feedTeam });
    }
    const pd = priceDiffs(fp.prices, op.prices);
    if (feedTeam != null && pd.length > 0) {
      report.players.priceMismatches.push({ id: op.id, name: op.name, team: feedTeam, diffs: pd });
    }
    const anchor = [];
    if (fp.draft_year != null && op.purchaseYear != null && Number(fp.draft_year) !== Number(op.purchaseYear)) {
      anchor.push({ field: "draftYear", feed: fp.draft_year, ours: op.purchaseYear });
    }
    if (fp.draft_price != null && op.originalPrice != null && Number(fp.draft_price) !== Number(op.originalPrice)) {
      anchor.push({ field: "draftPrice", feed: fp.draft_price, ours: op.originalPrice });
    }
    if (feedTeam != null && anchor.length > 0) {
      report.players.anchorMismatches.push({ id: op.id, name: op.name, diffs: anchor });
    }
  }

  // ── Draft picks ── key: year|round|originalTeam (unique: one per team/round/year)
  const ourPickByKey = new Map();
  for (const p of ours.draftPicks ?? []) {
    ourPickByKey.set(`${p.season}|${p.round}|${p.originalTeamName}`, p);
  }
  const feedPickKeys = new Set();
  for (const fp of feed.draft_picks ?? []) {
    const orig = teamName(fp.original_team_id);
    const key = `${fp.pick_year}|${fp.pick_round}|${orig}`;
    feedPickKeys.add(key);
    const op = ourPickByKey.get(key);
    if (!op) {
      report.picks.feedUnmatched.push({ ifflPickId: fp.id, key, currentTeam: teamName(fp.current_team_id) });
      continue;
    }
    // Spent picks are history — their holder rows can be stale upstream
    // without meaning anything (the 1.02-that-became-Mendoza case), and the
    // armed apply refuses them. Reporting them forever would just nag.
    if (op.status !== "available") continue;
    const feedCurrent = teamName(fp.current_team_id);
    if (feedCurrent !== op.currentTeamName) {
      report.picks.ownershipChanges.push({ id: op.id, key, ours: op.currentTeamName, feed: feedCurrent });
    }
  }
  report.picks.oursUnmatched = (ours.draftPicks ?? [])
    .filter((p) => !feedPickKeys.has(`${p.season}|${p.round}|${p.originalTeamName}`))
    .map((p) => ({ id: p.id, key: `${p.season}|${p.round}|${p.originalTeamName}` }));

  // ── Trades ── adopt-don't-duplicate: same team pair within ±3 days.
  //
  // Dates arrive in three shapes depending on who loaded them: Admin SDK
  // Timestamps ({toDate}), REST-decoded ISO strings, or Dates. The first
  // live run proved this the hard way — Timestamps made new Date(t.date)
  // Invalid, every window check failed, and all 42 feed trades reported as
  // "new" instead of 9 adopted + 33 new. Normalize before comparing.
  const asDate = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null);
  const WINDOW = 3 * 24 * 60 * 60 * 1000;
  const pairKey = (a, b) => [a, b].sort().join("::");
  const ourDone = (ours.trades ?? []).filter((t) => t.status === "completed" || t.status === "historical");
  const claimed = new Set();
  const feedPlayerById = new Map((feed.players ?? []).map((p) => [p.id, p]));
  const feedPickById = new Map((feed.draft_picks ?? []).map((p) => [p.id, p]));

  // Stamped trades match by id, exactly and first — the pair-window
  // heuristic below is only ever a first-contact mechanism.
  const ourByIfflTradeId = new Map(
    ourDone.filter((t) => t.ifflTradeId != null).map((t) => [Number(t.ifflTradeId), t]),
  );

  for (const ft of feed.trades ?? []) {
    const teamsInvolved = [...new Set((ft.items ?? []).flatMap((i) => [i.sender_team_id, i.receiver_team_id]))]
      .map(teamName).filter(Boolean);
    const when = new Date(`${ft.trade_date}T12:00:00`);
    const itemNames = (ft.items ?? []).map((i) =>
      i.player_id != null
        ? feedPlayerById.get(i.player_id)?.name ?? `player#${i.player_id}`
        : (() => { const p = feedPickById.get(i.draftpick_id); return p ? `${p.pick_year} R${p.pick_round} pick` : `pick#${i.draftpick_id}`; })(),
    );
    const stamped = ourByIfflTradeId.get(ft.id);
    if (stamped) {
      claimed.add(stamped.id);
      const ourCount = (stamped.assetsFromProposer?.length ?? 0) + (stamped.assetsFromReceiver?.length ?? 0);
      const entry = {
        ifflTradeId: ft.id, ourTradeId: stamped.id, date: ft.trade_date,
        teams: teamsInvolved, feedItems: itemNames.length, ourItems: ourCount, via: "ifflTradeId",
      };
      if (itemNames.length > ourCount) { entry.missingHere = itemNames; report.trades.adoptedNeedingItems.push(entry); }
      else report.trades.adopted.push(entry);
      continue;
    }
    const candidates = ourDone.filter(
      (t) => !claimed.has(t.id) &&
        pairKey(t.proposingTeamName, t.receivingTeamName) === pairKey(teamsInvolved[0], teamsInvolved[1]) &&
        asDate(t.date) && Math.abs(asDate(t.date) - when) <= WINDOW,
    ).sort((a, b) => Math.abs(asDate(a.date) - when) - Math.abs(asDate(b.date) - when));

    if (candidates.length === 0) {
      report.trades.newFromFeed.push({ ifflTradeId: ft.id, date: ft.trade_date, teams: teamsInvolved, items: itemNames });
      continue;
    }
    const adopted = candidates[0];
    claimed.add(adopted.id);
    const ourCount = (adopted.assetsFromProposer?.length ?? 0) + (adopted.assetsFromReceiver?.length ?? 0);
    const entry = {
      ifflTradeId: ft.id, ourTradeId: adopted.id, date: ft.trade_date,
      teams: teamsInvolved, feedItems: itemNames.length, ourItems: ourCount,
    };
    if (itemNames.length > ourCount) {
      entry.missingHere = itemNames;
      report.trades.adoptedNeedingItems.push(entry);
    } else {
      report.trades.adopted.push(entry);
    }
  }
  report.trades.oursUnmatched = ourDone
    .filter((t) => !claimed.has(t.id))
    .map((t) => ({ id: t.id, date: asDate(t.date)?.toISOString() ?? null, teams: [t.proposingTeamName, t.receivingTeamName], status: t.status }));

  return report;
}

module.exports = {
  OWNER_TO_TEAM,
  normalizeName,
  normalizePosition,
  matchTeams,
  matchPlayers,
  priceDiffs,
  diffSnapshot,
};
