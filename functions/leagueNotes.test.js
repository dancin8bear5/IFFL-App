const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("./leagueNotes");

const draft = (o = {}) => ({status: "draft", draftBody: "Week 3 recap", proposedSendAt: new Date("2026-09-22T17:00:00Z"), ...o});

test("approve carries body, time and destination", () => {
  const p = N.transition(draft(), "approve", {destination: "app"});
  assert.equal(p.status, "approved");
  assert.equal(p.body, "Week 3 recap");
  assert.equal(p.destination, "app");
  assert.ok(p.sendAt);
});

test("there is no path from draft to sent", () => {
  for (const a of ["send", "sent", "publish"]) assert.throws(() => N.transition(draft(), a));
  assert.throws(() => N.transition({status: "sent"}, "approve"));
  assert.throws(() => N.transition({status: "rejected"}, "approve"));
});

test("approve refuses an empty body or no time", () => {
  assert.throws(() => N.transition(draft({draftBody: "  "}), "approve"), /empty body/);
  assert.throws(() => N.transition(draft({proposedSendAt: null}), "approve"), /no send time/);
  assert.throws(() => N.transition(draft(), "approve", {destination: "twitter"}), /unknown destination/);
});

test("approved notes must be pulled back before editing", () => {
  assert.throws(() => N.transition({status: "approved"}, "edit", {body: "x"}), /unapprove/);
  assert.deepEqual(N.transition({status: "approved"}, "unapprove"), {status: "draft"});
  assert.deepEqual(N.transition(draft(), "edit", {body: "new"}), {body: "new"});
});

test("only approved + time reached + non-empty is due", () => {
  const now = Date.parse("2026-09-22T18:00:00Z");
  const past = new Date(now - 1000), future = new Date(now + 60000);
  assert.equal(N.isDue({status: "approved", body: "x", sendAt: past}, now), true);
  assert.equal(N.isDue({status: "approved", body: "x", sendAt: future}, now), false);
  assert.equal(N.isDue({status: "draft", body: "x", sendAt: past}, now), false);
  assert.equal(N.isDue({status: "approved", body: " ", sendAt: past}, now), false);
  assert.equal(N.isDue({status: "sending", body: "x", sendAt: past}, now), false, "no double send");
  assert.equal(N.isDue({status: "approved", body: "x", sendAt: {toMillis: () => now - 5}}, now), true);
});

const games = [
  {home: "Jared", away: "Bill", homeScore: 141.2, awayScore: 99.4, final: true},
  {home: "Abad", away: "Ryan", homeScore: 100.1, awayScore: 101.0, final: true},
  {home: "Foley", away: "Wayne", homeScore: 0, awayScore: 0, final: false},
];
const standings = [{place: 1, teamName: "Jared", record: "3-0", pointsFor: 400}, {place: 2, teamName: "Ryan", record: "2-1", pointsFor: 350}];

test("recap facts: winners, high/low, closest, only final games", () => {
  const f = N.recapFacts({season: 2026, week: 3, games, standings});
  assert.equal(f.games.length, 2);
  assert.deepEqual(f.games[1], {winner: "Ryan", winnerPoints: 101, loser: "Abad", loserPoints: 100.1, margin: 0.9});
  assert.deepEqual(f.high, {team: "Jared", points: 141.2});
  assert.deepEqual(f.low, {team: "Bill", points: 99.4});
  assert.equal(f.closest.margin, 0.9);
});

test("template recap passes its own fact check", () => {
  const f = N.recapFacts({season: 2026, week: 3, games, standings});
  const body = N.templateRecap(f);
  assert.match(body, /Week 3 recap/);
  assert.match(body, /Jared 141.2 def. Bill 99.4/);
  assert.deepEqual(N.factCheck(body, f), []);
});

test("fact check catches an invented number", () => {
  const f = N.recapFacts({season: 2026, week: 3, games, standings});
  assert.deepEqual(N.factCheck("Jared dropped 141.2 and is now 4-0 with 188 yards", f), ["188"]);
  assert.deepEqual(N.factCheck("Jared 141 on Bill", f), [], "rounded forms of real numbers are fine");
});

test("prompt carries the facts and the no-invention rule", () => {
  const p = N.recapPrompt({week: 3}, "Bill is always the villain");
  assert.match(p, /use ONLY the facts/);
  assert.match(p, /"week":3/);
  assert.match(p, /villain/);
});

// ── Sender, against the in-memory Firestore harness ──
const {FakeFirestore} = require("./harness/fakeFirestore");

function world(notesById) {
  const db = new FakeFirestore();
  for (const [id, n] of Object.entries(notesById)) db.doc(`leagueNotes/${id}`)._write(n, "set");
  return db;
}
const NOW = 1_800_000_000_000;
const run = (db, deliver, extra = {}) => N.runSender({db, nowMs: () => NOW, stamp: () => NOW, deliver, ...extra});

test("sender sends only approved + due notes, exactly once", async () => {
  const db = world({
    due: {status: "approved", body: "go", sendAt: NOW - 1},
    later: {status: "approved", body: "wait", sendAt: NOW + 60000},
    draft: {status: "draft", body: "nope", sendAt: NOW - 1},
  });
  const sent = [];
  const deliver = async (n) => { sent.push(n.body); return "groupme"; };
  await run(db, deliver);
  await run(db, deliver); // second pass must not resend
  assert.deepEqual(sent, ["go"]);
  assert.equal(db.get("leagueNotes", "due").status, "sent");
  assert.equal(db.get("leagueNotes", "later").status, "approved");
  assert.equal(db.get("leagueNotes", "draft").status, "draft");
});

test("a note unapproved between query and claim is not sent", async () => {
  const db = world({n: {status: "approved", body: "x", sendAt: NOW - 1}});
  const orig = db.runTransaction.bind(db);
  db.runTransaction = async (fn) => { db.doc("leagueNotes/n")._write({status: "draft"}, "update"); return orig(fn); };
  let calls = 0;
  await run(db, async () => { calls++; return "groupme"; });
  assert.equal(calls, 0);
  assert.equal(db.get("leagueNotes", "n").status, "draft");
});

test("GroupMe paused → held as approved; real error → failed + alert", async () => {
  const db = world({a: {status: "approved", body: "x", sendAt: NOW - 1}, b: {status: "approved", body: "y", sendAt: NOW - 1}});
  const alerts = [];
  await run(db, async (n) => {
    if (n.body === "x") throw Object.assign(new Error("paused"), {retry: true});
    throw new Error("HTTP 500");
  }, {onFailure: async (id) => alerts.push(id)});
  assert.equal(db.get("leagueNotes", "a").status, "approved");
  assert.equal(db.get("leagueNotes", "b").status, "failed");
  assert.deepEqual(alerts, ["b"]);
});
