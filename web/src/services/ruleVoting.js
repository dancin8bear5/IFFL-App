// ruleVoting — the IFFL rule-vote tally, per §Voting Structure.
//
//   · A rule needs a minimum of 7 votes to be eligible for approval.
//   · Round 1 votes on all proposals; those with 7+ votes are eligible.
//   · Round 2 is required if multiple rules pass in the SAME category
//     (except Operations); the rule with the most votes wins, and the
//     others must be resubmitted next year.
//   · Ties in Round 2 are broken by the Rules Committee.
//   · Any proposal rejected two years in a row cannot be resubmitted for
//     two more years.
import { RULE_CATEGORIES, VOTES_TO_PASS } from '../data/staticData.js'

export { VOTES_TO_PASS }

export const yesVotes = (rule) => Object.values(rule.votes ?? {}).filter((v) => v === 'yes').length
export const noVotes = (rule) => Object.values(rule.votes ?? {}).filter((v) => v === 'no').length

const isLimited = (category) =>
  RULE_CATEGORIES.find((c) => c.key === category)?.limited ?? false

/**
 * Tally an entire voting round.
 * @returns {{results: Array<{id, status, yes, reason}>, needsTiebreak: Array}}
 *   status ∈ 'passed' | 'failed' | 'deferred' | 'tiebreak'
 *     passed    — approved, takes effect (Operations immediately, others next season)
 *     failed    — under the 7-vote threshold
 *     deferred  — eligible but lost its category to a higher vote count;
 *                 resubmit next year (NOT counted as a rejection year)
 *     tiebreak  — eligible and tied for the category lead; Rules Committee decides
 */
export function tallyVotes(proposals) {
  const scored = proposals.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category ?? 'Operations',
    yes: yesVotes(r),
  }))

  const eligible = scored.filter((r) => r.yes >= VOTES_TO_PASS)
  const results = []

  // Below threshold → failed outright
  for (const r of scored) {
    if (r.yes < VOTES_TO_PASS) {
      results.push({ ...r, status: 'failed', reason: `${r.yes}/${VOTES_TO_PASS} votes` })
    }
  }

  // Group the eligible by category
  const byCategory = {}
  for (const r of eligible) (byCategory[r.category] ??= []).push(r)

  for (const [category, group] of Object.entries(byCategory)) {
    // Operations is unlimited — everything eligible passes
    if (!isLimited(category)) {
      for (const r of group) results.push({ ...r, status: 'passed', reason: 'Operations — no annual limit' })
      continue
    }
    // Limited category: only one may pass per year
    if (group.length === 1) {
      results.push({ ...group[0], status: 'passed', reason: `Only eligible ${category} rule` })
      continue
    }
    const top = Math.max(...group.map((r) => r.yes))
    const leaders = group.filter((r) => r.yes === top)
    if (leaders.length > 1) {
      // Round 2 tie → Rules Committee decides
      for (const r of group) {
        results.push(
          r.yes === top
            ? { ...r, status: 'tiebreak', reason: `Tied at ${top} votes — Rules Committee decides` }
            : { ...r, status: 'deferred', reason: `Lost ${category} to a ${top}-vote rule` },
        )
      }
      continue
    }
    for (const r of group) {
      results.push(
        r.yes === top
          ? { ...r, status: 'passed', reason: `Won ${category} with ${top} votes` }
          : { ...r, status: 'deferred', reason: `Lost ${category} to a ${top}-vote rule` },
      )
    }
  }

  return {
    results,
    needsTiebreak: results.filter((r) => r.status === 'tiebreak'),
  }
}

/**
 * §Rule Limits — rejected two years in a row → banned for two more years.
 * `rejectionYears` is the list of seasons this proposal was voted down.
 */
export function banStatus(rule, currentSeason) {
  const years = [...(rule.rejectionYears ?? [])].sort((a, b) => b - a)
  if (years.length < 2) return { banned: false }
  const [latest, previous] = years
  if (latest - previous !== 1) return { banned: false } // not consecutive
  const eligibleAgain = latest + 3 // banned for two more years after the 2nd rejection
  return currentSeason < eligibleAgain
    ? { banned: true, eligibleAgain, reason: `Rejected ${previous} and ${latest} — eligible again ${eligibleAgain}` }
    : { banned: false }
}

/** Approved rules start next season, except Operations which is immediate. */
export function effectiveSeason(category, decidedSeason) {
  return isLimited(category) ? decidedSeason + 1 : decidedSeason
}
