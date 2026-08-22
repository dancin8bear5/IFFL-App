const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPicks,
  extractDirection,
  resolveTeamToken,
  classifyTradeSignal,
  buildSignalGroups,
  SIREN,
} = require("./groupmeParser.js");

// ── Pick extraction ────────────────────────────────────────────
test("extractPicks catches '2027 2nd'", () => {
  const picks = extractPicks("Jared gets Jason's 2027 2nd + Turpin");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].year, 2027);
  assert.equal(picks[0].round, 2);
});

test("extractPicks catches '2027 R1'", () => {
  const picks = extractPicks("I'll give you my 2027 R1 for him");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].year, 2027);
  assert.equal(picks[0].round, 1);
});

test("extractPicks catches word ordinals with 'round'", () => {
  const picks = extractPicks("throw in a first round pick");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].round, 1);
  assert.equal(picks[0].year, null);
});

test("extractPicks catches shorthand year '27 1st'", () => {
  const picks = extractPicks("my '27 1st is on the table");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].year, 2027);
  assert.equal(picks[0].round, 1);
});

test("extractPicks does NOT fire on a bare '1st' with no pick context", () => {
  const picks = extractPicks("he's my 1st choice at QB");
  assert.equal(picks.length, 0);
});

test("extractPicks dedupes identical picks", () => {
  const picks = extractPicks("2027 2nd ... and again the 2027 2nd round pick");
  assert.equal(picks.length, 1);
});

// ── Team resolution ────────────────────────────────────────────
test("resolveTeamToken resolves owner first names", () => {
  assert.equal(resolveTeamToken("Jared"), "Jared");
  assert.equal(resolveTeamToken("jason"), "Jason");
  assert.equal(resolveTeamToken("Billy"), "Bill");
});

test("resolveTeamToken resolves abbrev slugs", () => {
  assert.equal(resolveTeamToken("MOON"), "Jared");
  assert.equal(resolveTeamToken("cats"), "Jason");
});

test("resolveTeamToken leaves ambiguous names unresolved", () => {
  assert.equal(resolveTeamToken("mike"), null);
  assert.equal(resolveTeamToken("zurek"), null);
});

// ── Direction extraction ───────────────────────────────────────
test("extractDirection pulls teams + phrases from 'X gets Y'", () => {
  const d = extractDirection("Jason gets Dak\nJared gets Jason's 2027 2nd + Turpin");
  assert.ok(d.teams.includes("Jason"));
  assert.ok(d.teams.includes("Jared"));
  assert.equal(d.directionPhrases.length, 2);
});

// ── The REGRESSION case: today's real trade that slipped past ──
test("REGRESSION: the Dak/Turpin/2027-2nd deal text is now a HIT", () => {
  const msg = { id: "2", sender_id: "jared", name: "Jared", text: "Jason gets Dak\n\nJared gets Jason's 2027 2nd + Turpin", created_at: 1000 };
  const r = classifyTradeSignal(msg);
  assert.equal(r.hit, true, "deal text must now classify as a hit");
  assert.ok(r.reasons.includes("syntax:direction"), "should trip direction syntax");
  assert.ok(r.reasons.includes("syntax:pick"), "should trip pick syntax");
  assert.equal(r.extracted.picks.length, 1);
  assert.equal(r.extracted.picks[0].year, 2027);
  assert.equal(r.extracted.picks[0].round, 2);
  assert.ok(r.extracted.teams.includes("Jason") && r.extracted.teams.includes("Jared"));
});

test("bare siren alone still hits on emoji", () => {
  const r = classifyTradeSignal({ id: "1", text: SIREN, created_at: 0 });
  assert.equal(r.hit, true);
  assert.ok(r.reasons.includes(`emoji:${SIREN}`));
  assert.equal(r.extracted.picks.length, 0);
});

// ── Siren + follow-up stitching (the core fix) ─────────────────
test("REGRESSION: bare 🚨 stitches to the follow-up deal from same sender", () => {
  const messages = [
    { id: "100", sender_id: "jared", name: "Jared", text: SIREN, created_at: 1000 },
    { id: "101", sender_id: "jared", name: "Jared", text: "Jason gets Dak\n\nJared gets Jason's 2027 2nd + Turpin", created_at: 1049 },
  ];
  const groups = buildSignalGroups(messages);
  assert.equal(groups.length, 1, "siren + deal must collapse into ONE review item");
  const g = groups[0];
  assert.equal(g.messageIds.length, 2);
  assert.ok(g.text.includes("Dak") && g.text.includes("Turpin"));
  assert.equal(g.extracted.picks.length, 1);
  assert.equal(g.extracted.picks[0].round, 2);
  assert.ok(g.reasons.includes(`emoji:${SIREN}`));
  assert.ok(g.reasons.includes("syntax:pick"));
});

test("stitching stops at a different sender", () => {
  const messages = [
    { id: "1", sender_id: "jared", name: "Jared", text: SIREN, created_at: 1000 },
    { id: "2", sender_id: "dugan", name: "Mike Dugan", text: "Some trades should just be announced", created_at: 1010 },
    { id: "3", sender_id: "jared", name: "Jared", text: "Jason gets Dak for my 2027 2nd", created_at: 1020 },
  ];
  const groups = buildSignalGroups(messages);
  // The siren is its own thin item (breaks at Dugan); Dugan's keyword msg is
  // its own item; Jared's #3 is its own item.
  const sirenGroup = groups.find((g) => g.primaryId === "1");
  assert.ok(sirenGroup, "siren still becomes a group");
  assert.equal(sirenGroup.messageIds.length, 1, "must NOT absorb across a different sender");
});

test("stitching respects the time window", () => {
  const messages = [
    { id: "1", sender_id: "jared", name: "Jared", text: SIREN, created_at: 1000 },
    { id: "2", sender_id: "jared", name: "Jared", text: "Jason gets Dak for my 2027 2nd", created_at: 1000 + 600 }, // 10 min later
  ];
  const groups = buildSignalGroups(messages, 180); // 3-min window
  const sirenGroup = groups.find((g) => g.primaryId === "1");
  assert.equal(sirenGroup.messageIds.length, 1, "10-min-late follow-up must not stitch under a 3-min window");
});

test("ordinary banter does NOT produce a signal", () => {
  const messages = [
    { id: "1", sender_id: "a", name: "A", text: "he's my 1st choice at QB honestly", created_at: 1 },
    { id: "2", sender_id: "b", name: "B", text: "lol nice", created_at: 2 },
  ];
  const groups = buildSignalGroups(messages);
  assert.equal(groups.length, 0);
});
