const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcile } = require("./tradeReconcile.js");
const { parseEspnTradeEmail } = require("./espnEmailParser.js");
const { buildSignalGroups } = require("./groupmeParser.js");

const REAL_EMAIL = `The following trade has been accepted in your ESPN Fantasy Football league Insanity League.
To: Shoot the Moon: IV
From: The Mojave Miracles
MOON trades
Dak Prescott, QB (DAL)
CATS trades
KaVontae Turpin, WR (DAL)
FOLLOW US`;

const SIREN = "\uD83D\uDEA8";

function todaysGroupMe() {
  const messages = [
    { id: "100", sender_id: "jared", name: "Jared", text: SIREN, created_at: 1000 },
    { id: "101", sender_id: "jared", name: "Jared", text: "Jason gets Dak\n\nJared gets Jason's 2027 2nd + Turpin", created_at: 1049 },
  ];
  return buildSignalGroups(messages)[0].extracted;
}

// ── THE headline regression: today's exact trade ───────────────
test("REGRESSION: clean ESPN players + GroupMe 2027 2nd → HOLD FOR REVIEW (never silent-drop the pick)", () => {
  const espn = parseEspnTradeEmail(REAL_EMAIL);
  const gm = todaysGroupMe();
  const r = reconcile(espn, gm);
  assert.equal(r.decision, "hold-for-review", "must NOT auto-apply when a pick is in play");
  assert.ok(r.reasons.some((x) => /pick/i.test(x)), "reason must call out the pick");
  assert.equal(r.picks.length, 1);
  assert.equal(r.picks[0].year, 2027);
  assert.equal(r.picks[0].round, 2);
});

test("a truly clean player-only trade WITH matching GroupMe → auto-eligible", () => {
  const espn = parseEspnTradeEmail(REAL_EMAIL);
  // GroupMe corroborates the same two teams, no pick.
  const gm = { picks: [], teams: ["Jared", "Jason"], directionPhrases: [{ team: "Jared" }, { team: "Jason" }] };
  const r = reconcile(espn, gm);
  assert.equal(r.decision, "auto-eligible");
});

test("no GroupMe signal at all → hold (no human corroboration)", () => {
  const espn = parseEspnTradeEmail(REAL_EMAIL);
  const r = reconcile(espn, null);
  assert.equal(r.decision, "hold-for-review");
  assert.ok(r.reasons.some((x) => /corroboration|no matching groupme/i.test(x)));
});

test("team mismatch between ESPN and GroupMe → hold", () => {
  const espn = parseEspnTradeEmail(REAL_EMAIL); // Jared + Jason
  const gm = { picks: [], teams: ["Jared", "Bill"], directionPhrases: [] };
  const r = reconcile(espn, gm);
  assert.equal(r.decision, "hold-for-review");
  assert.ok(r.reasons.some((x) => /mismatch/i.test(x)));
});

test("GroupMe references an extra team not in the ESPN trade → hold", () => {
  const espn = parseEspnTradeEmail(REAL_EMAIL);
  const gm = { picks: [], teams: [], directionPhrases: [{ team: "Wayne" }] };
  const r = reconcile(espn, gm);
  assert.equal(r.decision, "hold-for-review");
});

test("unparseable ESPN email → reject", () => {
  const espn = parseEspnTradeEmail("just a newsletter");
  const r = reconcile(espn, todaysGroupMe());
  assert.equal(r.decision, "reject");
});
