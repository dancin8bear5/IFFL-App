const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeMessageBody, getSubject } = require("./gmailWatch.js");

const b64url = (s) => Buffer.from(s, "utf8").toString("base64");

test("decodeMessageBody decodes a single-part text/plain body", () => {
  const payload = { mimeType: "text/plain", body: { data: b64url("Hello trade world") } };
  assert.equal(decodeMessageBody(payload), "Hello trade world");
});

test("decodeMessageBody prefers text/plain across multipart", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/html", body: { data: b64url("<b>HTML version</b>") } },
      { mimeType: "text/plain", body: { data: b64url("PLAIN version") } },
    ],
  };
  assert.equal(decodeMessageBody(payload), "PLAIN version");
});

test("decodeMessageBody falls back to stripped HTML when no plain part", () => {
  const html = "<p>MOON trades</p><p>Dak Prescott, QB (DAL)</p>";
  const payload = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64url(html) } }] };
  const out = decodeMessageBody(payload);
  assert.ok(out.includes("MOON trades"));
  assert.ok(out.includes("Dak Prescott, QB (DAL)"));
  assert.ok(!out.includes("<p>"));
});

test("decodeMessageBody handles a real ESPN-style plain body end to end", () => {
  const body = `The following trade has been accepted in your ESPN Fantasy Football league Insanity League.
To: Shoot the Moon: IV
From: The Mojave Miracles
MOON trades
Dak Prescott, QB (DAL)
CATS trades
KaVontae Turpin, WR (DAL)`;
  const payload = { mimeType: "text/plain", body: { data: b64url(body) } };
  const out = decodeMessageBody(payload);
  // Feed straight into the ESPN parser to prove the whole decode→parse path.
  const { parseEspnTradeEmail } = require("./espnEmailParser.js");
  const r = parseEspnTradeEmail(out);
  assert.equal(r.ok, true, r.error);
  const dak = r.moves.find((m) => m.player === "Dak Prescott");
  assert.equal(dak.fromTeam, "Jared");
  assert.equal(dak.toTeam, "Jason");
});

test("decodeMessageBody returns empty string for empty payload", () => {
  assert.equal(decodeMessageBody(null), "");
  assert.equal(decodeMessageBody({}), "");
});

test("getSubject pulls the Subject header case-insensitively", () => {
  const msg = { payload: { headers: [{ name: "From", value: "espn" }, { name: "Subject", value: "Trade accepted" }] } };
  assert.equal(getSubject(msg), "Trade accepted");
});
