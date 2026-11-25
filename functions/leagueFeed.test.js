const test = require("node:test");
const assert = require("node:assert/strict");
const feed = require("./leagueFeed");
const {factCheck} = require("./leagueNotes");

const game = {home: "Bill", away: "Jared", homeScore: 99.4, awayScore: 141.26};
const rows = [
  {team: "Jared", player: "Josh Allen", position: "QB", slot: "QB", points: 31.2},
  {team: "Jared", player: "Bijan Robinson", position: "RB", slot: "RB", points: 24},
  {team: "Jared", player: "Puka Nacua", position: "WR", slot: "WR", points: 18.5},
  {team: "Jared", player: "Some Kicker", position: "K", slot: "K", points: 2},
  {team: "Jared", player: "Bench Guy", position: "WR", slot: "Bench", points: 29.9},
  {team: "Jared", player: "Hurt Guy", position: "RB", slot: "IR", points: 40},
  {team: "Bill", player: "Jalen Hurts", position: "QB", slot: "QB", points: 17.1},
];
const standings = [{teamName: "Jared", record: "8-3"}, {teamName: "Bill", record: "4-7"}];

test("gameFacts: winner, loser, margin, records and player lines", () => {
  const f = feed.gameFacts({season: 2026, week: 11, game, playerRows: rows, standings});
  assert.equal(f.winner, "Jared");
  assert.equal(f.loser, "Bill");
  assert.equal(f.margin, 41.86);
  assert.equal(f.winnerRecord, "8-3");
  assert.deepEqual(f.winnerPlayers.top.map((p) => p.player), ["Josh Allen", "Bijan Robinson", "Puka Nacua"]);
  assert.equal(f.winnerPlayers.dud.player, "Some Kicker");
  // Bench, never IR: an injured-reserve score was never playable.
  assert.equal(f.winnerPlayers.bestBench.player, "Bench Guy");
  assert.equal(f.loserPlayers.dud, null);
});

test("gameFacts works with no player lines and no standings", () => {
  const f = feed.gameFacts({season: 2026, week: 11, game});
  assert.deepEqual(f.winnerPlayers, {top: [], dud: null, bestBench: null});
  assert.equal(f.winnerRecord, null);
  assert.ok(feed.templateGame(f).includes("Jared 141.26"));
});

test("every template passes its own fact check — the fallback can never be flagged", () => {
  const g = feed.gameFacts({season: 2026, week: 11, game, playerRows: rows, standings});
  assert.deepEqual(factCheck(feed.templateGame(g), g), []);
  const t = feed.tradeFacts({
    proposingTeamName: "Jared", receivingTeamName: "Bill", season: 2026,
    assetsFromProposer: [{displayName: "Puka Nacua"}, {displayName: "2027 R1 (Jared)"}],
    assetsFromReceiver: [{displayName: "Jalen Hurts"}],
  }, standings);
  assert.deepEqual(factCheck(feed.templateTrade(t), t), []);
  const w = feed.weekFacts({season: 2026, week: 11, games: [{...game, final: true}], standings: []});
  assert.deepEqual(factCheck(feed.templateWeek(w), w), []);
});

test("tradeFacts: each side GETS what the other sent — players and picks", () => {
  const t = feed.tradeFacts({
    proposingTeamName: "Jared", receivingTeamName: "Bill",
    assetsFromProposer: [{assetType: "player", displayName: "Puka Nacua"}, {assetType: "draftPick", displayName: "2027 R2 (Jared)"}],
    assetsFromReceiver: [{displayName: "Jalen Hurts"}, {displayName: "2027 1st (Bill)"}],
  });
  assert.deepEqual(t.teamAGets, {players: ["Jalen Hurts"], picks: ["2027 1st (Bill)"]});
  assert.deepEqual(t.teamBGets, {players: ["Puka Nacua"], picks: ["2027 R2 (Jared)"]});
  assert.match(feed.templateTrade(t), /Bill gets Puka Nacua, 2027 R2 \(Jared\)/);
  assert.ok(feed.templateTrade({...t, teamBGets: {players: [], picks: []}}).includes("Bill gets nothing"));
});

// The Nov 24, 2026 posts: the pick reached the trade five minutes after the
// players, and the write-up never heard about it.
test("tradeChanged: a pick added to a completed trade is a reason to rewrite", () => {
  const before = {status: "completed", assetsFromProposer: [{assetType: "player", displayName: "Kyler Murray"}], assetsFromReceiver: []};
  const after = {...before, assetsFromProposer: [...before.assetsFromProposer, {assetType: "draftPick", displayName: "2027 R2 (Abad)"}]};
  assert.equal(feed.tradeChanged(before, after), true);
  assert.equal(feed.tradeChanged(before, {...before, notes: "edited"}), false);
  assert.equal(feed.tradeChanged(before, {...before, feedRefresh: 1}), true);
  assert.equal(feed.tradeChanged({...before, picksPending: true}, {...before, picksPending: false}), true);
});

test("tradeIsWhole: a pick the chat mentioned holds the write-up until it lands", () => {
  const t = {assetsFromProposer: [{assetType: "player", displayName: "Dak Prescott"}], assetsFromReceiver: []};
  assert.equal(feed.tradeIsWhole(t), true);
  assert.equal(feed.tradeIsWhole({...t, picksPending: true}), false);
  assert.equal(feed.tradeIsWhole({...t, picksPending: false}), true);
  assert.equal(feed.tradeIsWhole({...t, picksPending: true, assetsFromReceiver: [{assetType: "draftPick", displayName: "2027 R2 (Bill)"}]}), true);
});

test("tradeCheck: 50 words, every player and pick named", () => {
  const f = feed.tradeFacts({
    proposingTeamName: "Abad", receivingTeamName: "Jason",
    assetsFromProposer: [{assetType: "player", displayName: "Kyler Murray"}, {assetType: "draftPick", displayName: "2027 R2 (Abad)"}],
    assetsFromReceiver: [{assetType: "player", displayName: "George Pickens"}],
  });
  const good = "Jason lands Kyler Murray and Abad's 2027 second-round pick; Abad gets George Pickens. Jason buys a quarterback for the stretch, Abad a receiver to keep.";
  assert.deepEqual(feed.tradeCheck(good, f), []);
  assert.match(feed.tradeCheck("Jason lands Murray; Abad gets Pickens.", f).join(), /left out the draft pick/);
  assert.match(feed.tradeCheck("Jason lands Murray and a 2027 second-round pick.", f).join(), /left out George Pickens/);
  assert.match(feed.tradeCheck(good + " word".repeat(40), f).join(), /limit is 50/);
});

test("writeVerified: a draft that fails the type's own check is rewritten, then templated", async () => {
  const facts = {x: 1};
  const check = (body) => (body.includes("pick") ? [] : ["left out the draft pick"]);
  const prompts = [];
  const twice = await feed.writeVerified({
    draft: async (p) => { prompts.push(p); return prompts.length === 1 ? "no mention" : "with the pick"; },
    prompt: "base", facts, template: "T", check, maxAttempts: 3,
  });
  assert.equal(twice.body, "with the pick");
  assert.equal(twice.attempts, 2);
  assert.match(prompts[1], /left out the draft pick/);
  const never = await feed.writeVerified({draft: async () => "no mention", prompt: "base", facts, template: "T", check});
  assert.equal(never.writer, "template");
});

test("isFreshTrade: only a completed trade inside the news window", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const base = {proposingTeamName: "Jared", receivingTeamName: "Bill", status: "completed"};
  assert.equal(feed.isFreshTrade({...base, completedAt: new Date(now - 3600e3)}, now), true);
  assert.equal(feed.isFreshTrade({...base, completedAt: {toMillis: () => now - 60e3}}, now), true);
  // A backfilled 2024 trade recorded today as 'completed' is not news.
  assert.equal(feed.isFreshTrade({...base, date: "2024-10-01"}, now), false);
  assert.equal(feed.isFreshTrade({...base, status: "proposed", completedAt: new Date(now)}, now), false);
  assert.equal(feed.isFreshTrade({...base, status: "historical", completedAt: new Date(now)}, now), false);
  assert.equal(feed.isFreshTrade({...base}, now), false); // no date at all → not guessed
});

test("feedId is stable whichever team is listed first", () => {
  assert.equal(feed.feedId.game(2026, 11, "Jared", "M. Zurek"), feed.feedId.game(2026, 11, "M. Zurek", "Jared"));
  assert.equal(feed.feedId.game(2026, 11, "Jared", "M. Zurek"), "game-2026-w11-jared-v-m-zurek");
});

// ── the loop ──
const facts = {winner: "Jared", winnerPoints: 141.26, loser: "Bill", loserPoints: 99.4};
const run = (draft, extra = {}) => feed.writeVerified({draft, prompt: "P", facts, template: "TEMPLATE", ...extra});

test("loop: a clean first draft publishes as written", async () => {
  const r = await run(async () => "Jared hung 141.26 on Bill, who managed 99.4.");
  assert.deepEqual({writer: r.writer, attempts: r.attempts}, {writer: "claude", attempts: 1});
});

test("loop: a flagged draft is rewritten, and the rewrite is told what was wrong", async () => {
  const prompts = [];
  const r = await run(async (p) => {
    prompts.push(p);
    return prompts.length === 1 ? "Jared won by 55 with 141.26." : "Jared 141.26, Bill 99.4.";
  });
  assert.equal(r.writer, "claude");
  assert.equal(r.attempts, 2);
  assert.equal(r.body, "Jared 141.26, Bill 99.4.");
  assert.match(prompts[1], /NOT in the facts: 55/);
  assert.deepEqual(r.tries[0].flags, ["55"]);
});

test("loop: two flagged drafts → the template, and it stops there", async () => {
  let calls = 0;
  const r = await run(async () => { calls++; return "Jared scored 200."; });
  assert.equal(calls, feed.MAX_ATTEMPTS);
  assert.deepEqual({body: r.body, writer: r.writer}, {body: "TEMPLATE", writer: "template"});
});

test("loop: no writer configured → template without retrying", async () => {
  let calls = 0;
  const r = await run(async () => { calls++; return null; });
  assert.equal(calls, 1);
  assert.equal(r.writer, "template");
});

test("loop: an error counts as an attempt and the next one can still succeed", async () => {
  let calls = 0;
  const r = await run(async () => { if (++calls === 1) throw new Error("HTTP 529"); return "Jared 141.26."; });
  assert.equal(r.writer, "claude");
  assert.equal(r.tries[0].error, "HTTP 529");
});

test("loop: errors every time → template", async () => {
  const r = await run(async () => { throw new Error("down"); });
  assert.equal(r.writer, "template");
  assert.equal(r.attempts, feed.MAX_ATTEMPTS);
});

test("feedPost always writes hidden:false and refuses an unknown type", () => {
  const p = feed.feedPost({type: "game", season: 2026, week: 11, title: "t", facts, result: {body: "b", writer: "claude", attempts: 1, tries: []}, now: 1});
  assert.equal(p.hidden, false);
  assert.throws(() => feed.feedPost({type: "rumor", season: 2026, title: "t", facts, result: {}, now: 1}));
});

test("isLocked: a hidden or edited post is never overwritten", () => {
  assert.equal(feed.isLocked(undefined), false);
  assert.equal(feed.isLocked({hidden: false}), false);
  assert.equal(feed.isLocked({hidden: true}), true);
  assert.equal(feed.isLocked({hidden: false, editedAt: 5}), true);
});

test("prompts carry the facts and the hard rules", () => {
  for (const p of [feed.gamePrompt(facts), feed.weekPrompt(facts), feed.tradePrompt(facts, "be mean to Bill")]) {
    assert.ok(p.includes(JSON.stringify(facts)));
    assert.match(p, /HARD RULES/);
  }
  assert.match(feed.tradePrompt(facts, "be mean to Bill"), /be mean to Bill/);
});

// ── records ──
test("record post: template names the mark and the old holder, and passes its fact check", () => {
  const f = feed.recordFacts({
    card: {label: "Highest Single-Game Score", tone: "high", team: "Jared", value: "270.5 pts", detail: "vs Bill (270.5–120)", season: 2026, week: 11},
    previous: {team: "M. Zurek", value: "264.12 pts", season: 2020, week: 16},
  });
  const body = feed.templateRecord(f);
  assert.match(body, /Highest Single-Game Score: Jared, 270.5 pts/);
  assert.match(body, /M. Zurek, 264.12 pts \(2020, week 16\)/);
  assert.deepEqual(factCheck(body, f), []);
  assert.ok(!feed.templateRecord({...f, previous: null}).includes("old mark"));
});

// ── calendar milestones ──
const cal = [
  {name: "NFL Season Start", icon: "🏈", date: "2026-09-09", phase: "regular"},
  {name: "Trade Deadline", icon: "⇄", date: "2026-11-25", time: "2:00p CST"},
  {name: "Playoffs Begin", icon: "🥊", date: "2026-12-16", phase: "playoffs"},
];
const at = (iso) => Date.parse(iso);

test("centralNow: a UTC evening is still the same Central day", () => {
  assert.deepEqual(feed.centralNow(at("2026-11-26T02:30:00Z")), {date: "2026-11-25", hour: 20});
});

test("milestonesDue: the day itself, with what comes next", () => {
  const [m, ...rest] = feed.milestonesDue(cal, at("2026-11-25T15:00:00Z")); // 9am Central
  assert.equal(rest.length, 0);
  assert.deepEqual([m.kind, m.name, m.time, m.daysAway], ["today", "Trade Deadline", "2:00p CST", 0]);
  assert.deepEqual(m.next, {name: "Playoffs Begin", date: "2026-12-16", daysAfter: 21});
});

test("milestonesDue: a reminder two days before a deadline — but only for dates with a clock time", () => {
  const due = feed.milestonesDue(cal, at("2026-11-23T15:00:00Z"));
  assert.deepEqual(due.map((m) => [m.kind, m.name]), [["reminder", "Trade Deadline"]]);
  assert.deepEqual(feed.milestonesDue(cal, at("2026-12-14T15:00:00Z")), []); // Playoffs Begin has no time
});

test("milestonesDue: a phase boundary says which phase opens", () => {
  const [m] = feed.milestonesDue(cal, at("2026-12-16T15:00:00Z"));
  assert.equal(m.opensPhase, "Playoffs");
  assert.match(feed.templateMilestone(m), /Today: Playoffs Begin\. Playoffs starts now\./);
});

test("milestonesDue: nothing before 7am Central, nothing on an ordinary day, nothing from a bad calendar", () => {
  assert.deepEqual(feed.milestonesDue(cal, at("2026-11-25T08:00:00Z")), []); // 2am Central
  assert.deepEqual(feed.milestonesDue(cal, at("2026-11-21T18:00:00Z")), []);
  assert.deepEqual(feed.milestonesDue(null, at("2026-11-25T15:00:00Z")), []);
  assert.deepEqual(feed.milestonesDue([{name: "Bad", date: "Nov 25"}], at("2026-11-25T15:00:00Z")), []);
});

test("milestone templates pass their own fact check", () => {
  for (const when of ["2026-11-25T15:00:00Z", "2026-11-23T15:00:00Z", "2026-12-16T15:00:00Z"]) {
    for (const f of feed.milestonesDue(cal, at(when))) assert.deepEqual(factCheck(feed.templateMilestone(f), f), []);
  }
  assert.notEqual(feed.feedId.milestone("Trade Deadline", "2026-11-25", "today"), feed.feedId.milestone("Trade Deadline", "2026-11-25", "reminder"));
});
