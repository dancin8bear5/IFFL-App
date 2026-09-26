const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEspnTradeEmail, resolveAbbrev } = require("./espnEmailParser.js");

// The EXACT email body from 2026-08-16 (the one that got missed).
const REAL_EMAIL = `The following trade has been accepted in your ESPN Fantasy Football league Insanity League.
To: Shoot the Moon: IV
From: The Mojave Miracles
MOON trades
Dak Prescott, QB (DAL)
CATS trades
KaVontae Turpin, WR (DAL)

ESPN Fantasy App
Download the No. 1 fantasy sports app and play fantasy football, basketball, baseball, hockey and much more. All in one place!
FOLLOW US
This email was sent to: jaredrogtaylor@gmail.com. Please do not reply to this email as this address is not monitored.
© ESPN Internet Ventures. All Rights Reserved.`;

// Same email but with markdown link wrappers (as pasted from some clients).
const MD_EMAIL = `The following trade has been accepted in your ESPN Fantasy Football league **Insanity League**.
To: **Shoot the Moon: IV**
From: **The Mojave Miracles**
MOON trades
Dak Prescott, QB (DAL)
CATS trades
KaVontae Turpin, WR (DAL)
**[ESPN Fantasy App](http://www.espn.com/x)**
FOLLOW US`;

test("resolveAbbrev maps ESPN slugs to team names", () => {
  assert.equal(resolveAbbrev("MOON"), "Jared");
  assert.equal(resolveAbbrev("cats"), "Jason");
  assert.equal(resolveAbbrev("BILL"), "Bill");
  assert.equal(resolveAbbrev("NOPE"), null);
});

test("REGRESSION: parses today's real email with CORRECT direction", () => {
  const r = parseEspnTradeEmail(REAL_EMAIL);
  assert.equal(r.ok, true, r.error);
  // MOON trades Dak → Dak LEAVES Jared, goes to Jason.
  const dak = r.moves.find((m) => m.player === "Dak Prescott");
  assert.ok(dak, "Dak must be parsed");
  assert.equal(dak.fromTeam, "Jared", "MOON trades Dak → Jared sends");
  assert.equal(dak.toTeam, "Jason");
  // CATS trades Turpin → Turpin LEAVES Jason, goes to Jared.
  const turpin = r.moves.find((m) => m.player === "KaVontae Turpin");
  assert.ok(turpin, "Turpin must be parsed");
  assert.equal(turpin.fromTeam, "Jason", "CATS trades Turpin → Jason sends");
  assert.equal(turpin.toTeam, "Jared");
});

test("To:/From: header is a DECOY — direction comes from the trades blocks", () => {
  // Header says To: Shoot the Moon (Jared). Naive parsing would say Jared
  // RECEIVES everything. But MOON trades Dak means Jared SENDS Dak.
  const r = parseEspnTradeEmail(REAL_EMAIL);
  const dak = r.moves.find((m) => m.player === "Dak Prescott");
  assert.equal(dak.fromTeam, "Jared"); // NOT toTeam — proves header ignored
  assert.equal(r.meta.to, "Shoot the Moon: IV");
  assert.equal(r.meta.from, "The Mojave Miracles");
});

test("handles markdown-wrapped body", () => {
  const r = parseEspnTradeEmail(MD_EMAIL);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.moves.length, 2);
});

test("boilerplate never leaks into player parsing", () => {
  const r = parseEspnTradeEmail(REAL_EMAIL);
  const names = r.moves.map((m) => m.player);
  assert.ok(!names.some((n) => /espn|download|follow/i.test(n)));
  assert.equal(r.moves.length, 2);
});

test("rejects a non-trade email", () => {
  const r = parseEspnTradeEmail("Your weekly matchup recap is ready!");
  assert.equal(r.ok, false);
  assert.match(r.error, /anchor/i);
});

test("rejects an unrecognized team abbrev for human review", () => {
  const bad = REAL_EMAIL.replace("MOON trades", "XXXX trades");
  const r = parseEspnTradeEmail(bad);
  assert.equal(r.ok, false);
  assert.match(r.error, /abbrev/i);
});

test("flags a 3-team email as needing human review", () => {
  const threeWay = `The following trade has been accepted in your ESPN Fantasy Football league Insanity League.
MOON trades
Dak Prescott, QB (DAL)
CATS trades
KaVontae Turpin, WR (DAL)
BILL trades
Josh Allen, QB (BUF)
FOLLOW US`;
  const r = parseEspnTradeEmail(threeWay);
  assert.equal(r.ok, false);
  assert.match(r.error, /2 trading teams|human review/i);
});

test("handles a lopsided 2-for-1 within one block", () => {
  const twoForOne = `The following trade has been accepted in your ESPN Fantasy Football league Insanity League.
MOON trades
Dak Prescott, QB (DAL)
Puka Nacua, WR (LAR)
CATS trades
KaVontae Turpin, WR (DAL)
FOLLOW US`;
  const r = parseEspnTradeEmail(twoForOne);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.moves.length, 3);
  assert.equal(r.moves.filter((m) => m.fromTeam === "Jared").length, 2);
  assert.equal(r.moves.filter((m) => m.fromTeam === "Jason").length, 1);
});

// ── Void / unclassified classification ────────────────────────
const { classifyEspnEmail, looksTradeRelated } = require("./espnEmailParser");

test("an accepted email classifies as accepted", () => {
  assert.strictEqual(
    classifyEspnEmail("The following trade has been accepted in your ESPN Fantasy Football league."),
    "accepted",
  );
});

test("plausible void wordings classify as voided", () => {
  for (const body of [
    "This trade has been vetoed by the league manager.",
    "The trade has been voided.",
    "Your trade has been reversed.",
    "The following trade was overturned.",
    "This trade has been cancelled.",
    "This trade has been canceled.",
  ]) {
    assert.strictEqual(classifyEspnEmail(body), "voided", body);
  }
});

test("a void is never mistaken for an accept", () => {
  // The safety property: applying requires the accepted anchor, so even a
  // void we fail to classify can never move a roster.
  const { parseEspnTradeEmail } = require("./espnEmailParser");
  const voided = "The following trade has been vetoed.\nMOON trades\nDak Prescott, QB (DAL)";
  assert.strictEqual(parseEspnTradeEmail(voided).ok, false);
});

test("unknown wording is flagged as trade-related so it surfaces", () => {
  const odd = "Something happened with a trade. MOON trades were involved.";
  assert.strictEqual(classifyEspnEmail(odd), "unknown");
  assert.strictEqual(looksTradeRelated(odd), true, "must still reach a human");
});

test("unrelated mail is neither classified nor surfaced", () => {
  const noise = "Your weekly matchup recap is ready.";
  assert.strictEqual(classifyEspnEmail(noise), "unknown");
  assert.strictEqual(looksTradeRelated(noise), false);
});
