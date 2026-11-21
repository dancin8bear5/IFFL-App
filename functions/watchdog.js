// watchdog — tell the commissioner when a job breaks, and when it recovers.
//
// pollerHealth decides whether each job is healthy; until now that verdict
// was only ever read during a manual deploy. This turns it into a loop:
//
//   every hour ──▶ evaluate ──▶ compare with last hour ──▶ DM on a CHANGE
//                                                     └──▶ nudge once a day while still broken
//
// "On a change" is the whole design. A watchdog that repeats itself every
// hour gets muted, and a muted watchdog is the silent failure it replaced.
//
// Pure: results + previous state + now in, new state + message out. The
// Firestore reads and the DM live in index.js (runWatchdog).

const REMIND_MS = 24 * 60 * 60 * 1000;

/**
 * @param prev     config/watchdog data: {failing: {name: {reason, since, alertedAt}}}
 * @param results  pollerHealth.evaluate() output (+ any extra {name, ok, reason})
 * @returns {failing, broke, recovered, reminders}
 */
function diffHealth(prev, results, nowMs) {
  const was = prev?.failing && typeof prev.failing === "object" ? prev.failing : {};
  const failing = {};
  const broke = [];
  const reminders = [];
  for (const r of results ?? []) {
    if (r.ok) continue;
    const old = was[r.name];
    if (!old) {
      failing[r.name] = {reason: r.reason, since: nowMs, alertedAt: nowMs};
      broke.push({name: r.name, reason: r.reason});
    } else if (nowMs - (old.alertedAt ?? 0) >= REMIND_MS) {
      failing[r.name] = {reason: r.reason, since: old.since ?? nowMs, alertedAt: nowMs};
      reminders.push({name: r.name, reason: r.reason, since: old.since ?? nowMs});
    } else {
      failing[r.name] = {...old, reason: r.reason};
    }
  }
  const recovered = Object.keys(was).filter((n) => !failing[n]);
  return {failing, broke, recovered, reminders};
}

/** The DM, or null when nothing changed — the common case. */
function watchdogMessage({broke, recovered, reminders}, nowMs) {
  const lines = [];
  for (const b of broke) lines.push(`🔴 ${b.name} — ${b.reason}`);
  for (const r of reminders) {
    lines.push(`🟠 still down ${Math.round((nowMs - r.since) / 3600000)}h: ${r.name} — ${r.reason}`);
  }
  for (const n of recovered) lines.push(`🟢 ${n} — back to normal`);
  return lines.length ? `🩺 IFFL watchdog\n${lines.join("\n")}` : null;
}

module.exports = {REMIND_MS, diffHealth, watchdogMessage};
