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

test("tradeFacts: each side GETS what the other sent", () => {
  const t = feed.tradeFacts({
    proposingTeamName: "Jared", receivingTeamName: "Bill",
    assetsFromProposer: [{displayName: "Puka Nacua"}], assetsFromReceiver: [{displayName: "Jalen Hurts"}],
  });
  assert.deepEqual(t.teamAGets, ["Jalen Hurts"]);
  assert.deepEqual(t.teamBGets, ["Puka Nacua"]);
  assert.ok(feed.templateTrade({...t, teamBGets: []}).includes("Bill gets nothing"));
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
