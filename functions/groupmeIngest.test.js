const test = require("node:test");
const assert = require("node:assert/strict");
const {looksLikeTradeConfirmation, findPickMentions, resolveGroupMeTrade, TEAM_ALIASES} = require("./groupmeIngest.js");

test("looksLikeTradeConfirmation triggers on 'official'", () => {
  assert.equal(looksLikeTradeConfirmation("Make it official. 🚨"), true);
  assert.equal(looksLikeTradeConfirmation("IT'S OFFICIAL, boys"), true);
});

test("looksLikeTradeConfirmation does NOT trigger on plain trade banter or the 🚨 emoji alone", () => {
  // Real example from league history: this deal fell through ("I BACKED OUT")
  assert.equal(looksLikeTradeConfirmation("i get 1.02 and 2.04 btw"), false);
  assert.equal(looksLikeTradeConfirmation("🚨"), false);
  assert.equal(looksLikeTradeConfirmation("guy at the bar in dallas told me jerruh was trading up for Love"), false);
  assert.equal(looksLikeTradeConfirmation("I BACKED OUT"), false);
});

test("findPickMentions parses 2-digit years and attributes by nearby cue words", () => {
  const mentions = findPickMentions("My 27 1st for Dugan 27 1st", "Jared", TEAM_ALIASES);
  assert.equal(mentions.length, 2);
  assert.deepEqual(mentions[0], {year: 2027, round: 1, attributedTeam: "Jared", index: 3});
  assert.equal(mentions[1].year, 2027);
  assert.equal(mentions[1].round, 1);
  assert.equal(mentions[1].attributedTeam, "Dugan");
});

test("findPickMentions handles word-form ordinals and 4-digit years", () => {
  const mentions = findPickMentions("Bill sends his 2028 third rounder", "Jared", TEAM_ALIASES);
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].year, 2028);
  assert.equal(mentions[0].round, 3);
  assert.equal(mentions[0].attributedTeam, "Bill");
});

const ROSTER = [
  {id: "p1", name: "Justin Jefferson", teamName: "Bill"},
  {id: "p2", name: "Patrick Mahomes", teamName: "Jared"},
];
const PICKS_2027_1STS = [
  {id: "pk_jared_27_1", season: 2027, round: 1, currentTeamName: "Jared"},
  {id: "pk_dugan_27_1", season: 2027, round: 1, currentTeamName: "Dugan"},
];

test("resolveGroupMeTrade: not triggered -> {triggered:false}, no further parsing attempted", () => {
  const r = resolveGroupMeTrade({
    text: "guy at the bar told me jerruh was trading up for Love",
    senderTeam: "Faybik", rosterSnapshot: ROSTER, picksSnapshot: PICKS_2027_1STS,
  });
  assert.deepEqual(r, {triggered: false});
});

test("resolveGroupMeTrade: real example — pick-for-pick swap parses clean and pending", () => {
  const r = resolveGroupMeTrade({
    text: "Make it official. 🚨\nMy 27 1st for Dugan 27 1st",
    senderTeam: "Jared", rosterSnapshot: [], picksSnapshot: PICKS_2027_1STS,
  });
  assert.equal(r.triggered, true);
  assert.equal(r.ok, true);
  assert.deepEqual(new Set([r.teamA, r.teamB]), new Set(["Jared", "Dugan"]));
  assert.equal(r.moves.length, 2);
  const jaredMove = r.moves.find((m) => m.fromTeam === "Jared");
  const duganMove = r.moves.find((m) => m.fromTeam === "Dugan");
  assert.equal(jaredMove.assetId, "pk_jared_27_1");
  assert.equal(jaredMove.toTeam, "Dugan");
  assert.equal(duganMove.assetId, "pk_dugan_27_1");
  assert.equal(duganMove.toTeam, "Jared");
});

test("resolveGroupMeTrade: player-for-player, both named teams found via player ownership", () => {
  const r = resolveGroupMeTrade({
    text: "Official: Justin Jefferson to Jared for Patrick Mahomes",
    senderTeam: "Bill", rosterSnapshot: ROSTER, picksSnapshot: [],
  });
  assert.equal(r.ok, true);
  assert.equal(r.moves.length, 2);
  assert.ok(r.moves.some((m) => m.assetId === "p1" && m.fromTeam === "Bill" && m.toTeam === "Jared"));
  assert.ok(r.moves.some((m) => m.assetId === "p2" && m.fromTeam === "Jared" && m.toTeam === "Bill"));
});

test("resolveGroupMeTrade: bare 'Zurek' mention never reaches ownership fallback — no team named means no second side, full stop", () => {
  const picks = [
    {id: "pk_a", season: 2027, round: 2, currentTeamName: "A. Zurek"},
  ];
  const r = resolveGroupMeTrade({
    text: "Official — my 27 2nd for Zurek 27 2nd",
    senderTeam: "Wayne", rosterSnapshot: [], picksSnapshot: picks,
  });
  // Ownership-fallback attribution only runs once exactly two sides are
  // already established from text (named teams / player ownership /
  // text-attributed picks). A bare "Zurek" contributes nothing to that
  // step even though A. Zurek is, in isolation, the only team that could
  // hold this pick — the parser won't reach into pick ownership just to
  // discover who the second side even is. Flags for review instead.
  assert.equal(r.ok, false);
  assert.match(r.reason, /second team/);
});

test("resolveGroupMeTrade: ownership fallback correctly stays ambiguous when BOTH Zureks hold a matching pick", () => {
  const picks = [
    {id: "pk_a", season: 2027, round: 2, currentTeamName: "A. Zurek"},
    {id: "pk_m", season: 2027, round: 2, currentTeamName: "M. Zurek"},
  ];
  const r = resolveGroupMeTrade({
    text: "Official — my 27 2nd for Zurek 27 2nd",
    senderTeam: "Wayne", rosterSnapshot: [], picksSnapshot: picks,
  });
  // involved-team detection can't even get to 2 distinct sides here since
  // neither Zurek team is named or ownership-resolvable up front from a
  // single ambiguous mention — should NOT silently pick one.
  assert.equal(r.ok, false);
});

test("resolveGroupMeTrade: trigger phrase but can't find a second team -> flagged, not silently dropped", () => {
  const r = resolveGroupMeTrade({
    text: "Make it official, I'm sitting Josh Allen this week",
    senderTeam: "Jared", rosterSnapshot: [], picksSnapshot: [],
  });
  assert.equal(r.triggered, true);
  assert.equal(r.ok, false);
  assert.match(r.reason, /second team/);
});

test("resolveGroupMeTrade: two sides found but nothing parses to an asset -> flagged for review", () => {
  const r = resolveGroupMeTrade({
    text: "Official: Bill and Ryan are working on something",
    senderTeam: "Jared", rosterSnapshot: [], picksSnapshot: [],
  });
  assert.equal(r.triggered, true);
  assert.equal(r.ok, false);
  assert.equal(r.moves.length, 0);
  assert.match(r.problems[0].reason, /no players or picks/);
});

test("resolveGroupMeTrade: a real trade doc offer that later falls through is still just a trigger-less message before confirmation lands", () => {
  // The full negotiation from league history never actually says
  // "official" until it's confirmed — the fake-out messages shouldn't trigger.
  assert.equal(looksLikeTradeConfirmation("YES"), false);
  assert.equal(looksLikeTradeConfirmation("I BACKED OUT"), false);
  assert.equal(looksLikeTradeConfirmation("TACO Matt"), false);
});
