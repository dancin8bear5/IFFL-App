// tradeVotes — BOOM/DOOM verdicts on trades.
//
// Every league member gets one permanent vote per trade: which side BOOMED.
// The other side DOOMED by definition, so a trade needs exactly one choice,
// not a rating per team.
//
// Three rules shape everything here:
//   1. One vote per member per trade. Enforced by the doc id
//      "<tradeId>_<uid>" — a second vote collides with itself.
//   2. Votes are permanent. No update path exists, in the rules or here.
//   3. You cannot vote on a trade you were in. Enforced in firestore.rules
//      too, since it's the rule that makes the tally mean anything.
//
// The running tally stays hidden until you've voted, so the crowd can't
// anchor a judgment you're never allowed to revise.

/** Both sides of a trade, in a stable order (proposer first). */
export function tradeSides(trade) {
  return [trade?.proposingTeamName, trade?.receivingTeamName].filter(Boolean)
}

/** Was this team on either side of the trade? */
export function isParticipant(trade, teamName) {
  return !!teamName && tradeSides(trade).includes(teamName)
}

/**
 * Whether `userTeam` is allowed to cast a verdict on `trade`.
 * A member with no team assigned can't vote either — there'd be no way to
 * tell whether they were in it.
 */
export function canVote(trade, userTeam) {
  if (!trade || !userTeam) return false
  return !isParticipant(trade, userTeam)
}

/** This user's vote on this trade, or null. */
export function myVote(votes, tradeId, uid) {
  if (!uid) return null
  return votes.find((v) => v.tradeId === tradeId && v.uid === uid) ?? null
}

/**
 * Verdict for one trade.
 *
 * Returns a row per side with its count and share, plus the leader. `total`
 * of 0 means nobody has weighed in — callers show "no verdict yet" rather
 * than a 0–0 bar, since an empty bar reads as a real 50/50 split.
 *
 * Ties report `leader: null`. A 6–6 split is a genuine outcome in a league
 * this size and calling it for whoever sorts first would be a lie.
 */
export function tallyVotes(votes, trade) {
  const sides = tradeSides(trade)
  const forTrade = votes.filter((v) => v.tradeId === trade?.id)
  const counts = new Map(sides.map((s) => [s, 0]))

  for (const v of forTrade) {
    // A vote for a team no longer on the trade (renamed, or bad data) is
    // counted in `total` nowhere — drop it rather than inventing a side.
    if (counts.has(v.votedFor)) counts.set(v.votedFor, counts.get(v.votedFor) + 1)
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const rows = sides.map((team) => ({
    team,
    count: counts.get(team) ?? 0,
    share: total > 0 ? (counts.get(team) ?? 0) / total : 0,
  }))

  const best = Math.max(0, ...rows.map((r) => r.count))
  const atTop = rows.filter((r) => r.count === best)
  return {
    rows,
    total,
    leader: total > 0 && atTop.length === 1 ? atTop[0].team : null,
  }
}

/**
 * How many of `trades` this user still has a say on — trades they weren't
 * in and haven't judged. Drives the "N left to judge" nudge.
 */
export function unjudgedCount(trades, votes, uid, userTeam) {
  return trades.filter(
    (t) => canVote(t, userTeam) && !myVote(votes, t.id, uid),
  ).length
}

/** Career BOOM record: how often the league said each team won its trades. */
export function boomRecord(trades, votes) {
  const rec = new Map()
  const bump = (team, key) => {
    if (!team) return
    if (!rec.has(team)) rec.set(team, { team, booms: 0, dooms: 0, judged: 0 })
    rec.get(team)[key] += 1
  }
  for (const t of trades) {
    const { leader, total } = tallyVotes(votes, t)
    if (!total || !leader) continue // unjudged or a dead tie decides nothing
    for (const side of tradeSides(t)) {
      bump(side, side === leader ? 'booms' : 'dooms')
      rec.get(side).judged += 1
    }
  }
  return [...rec.values()]
    .map((r) => ({ ...r, boomPct: r.judged > 0 ? r.booms / r.judged : 0 }))
    .sort((a, b) => b.boomPct - a.boomPct || b.judged - a.judged)
}
