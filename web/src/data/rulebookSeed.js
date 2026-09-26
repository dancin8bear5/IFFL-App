// rulebookSeed — the league's written rules and the live 2026 proposals.
//
// Two different things live here, deliberately kept apart:
//
//   handbook       — the standing rulebook (2025 IFFL League Document). Static
//                    reference text rendered in-app so the league reads the
//                    rules where they play, not in a PDF. Never written to
//                    Firestore, never voted on.
//   proposals2026  — the ten proposals on the table this year, verbatim from
//                    Keeper Master p15 (Title · Years Proposed · Proposed By ·
//                    Description), seeded into the `rules` collection by Admin
//                    so they can be voted on. Carries yearsProposed and
//                    rejectionYears so the two-year-ban rule is enforceable.

import {
  AUCTION_BUDGET, ROSTER_CAP, FAAB_BUDGET, LUXURY_TAX_PER_TEAM, LUXURY_TAX_TOTAL,
  ROSTER_SIZE, STARTER_COUNT, BENCH_COUNT, IR_SLOTS, PLAYOFF_TEAMS,
  REGULAR_SEASON_WEEKS, SEEDING_BONUS_PER_WIN, KEEPER_ESCALATION_STEP,
  WAIVER_KEEPER_VALUE, WAIVER_CLEARS_REQUIRED, VOTES_TO_PASS, fantasyTeams,
} from './staticData.js'

const $ = (n) => `$${n}`

/**
 * The standing rulebook, grouped the way the League Document is written.
 * Each entry: { rule, detail } — short label, then the actual provision.
 */
export const handbook = [
  {
    section: 'Rosters, Transactions & Lineups',
    glyph: '📋',
    color: '#F4A261',
    entries: [
      { rule: 'Roster size', detail: `${ROSTER_SIZE} players — ${STARTER_COUNT} starters, ${BENCH_COUNT} bench, ${IR_SLOTS} IR.` },
      { rule: 'Starting lineup', detail: 'QB, RB, RB, WR, WR, TE, FLEX (RB/WR/TE), OP (any offensive player), D/ST. There is no kicker slot.' },
      { rule: 'Invalid lineup', detail: 'Fielding an incomplete or illegal lineup draws a Commissioner’s fine (amount TBD). The commissioner may post a missing lineup, and it is deemed official.' },
      { rule: 'Bye / IR starters', detail: 'A starter on bye or IR is corrected by the commissioner before scoring locks.' },
      { rule: 'FAAB budget', detail: `${$(FAAB_BUDGET)} per team per season, separate from the auction budget. Waivers run on free-agent auction bidding.` },
      { rule: 'Waiver pickups and the cap', detail: `Players added off waivers do not count toward the ${$(ROSTER_CAP)} in-season cap. Any waiver player kept the following season enters at a flat ${$(WAIVER_KEEPER_VALUE)}, regardless of the FAAB price paid.` },
      { rule: 'Dropped players', detail: `A drafted or kept player who is dropped keeps his salary until he clears ${WAIVER_CLEARS_REQUIRED} FAAB auctions. Claimed before clearing, his salary follows him to the new team. After clearing, his value resets to ${$(WAIVER_KEEPER_VALUE)}.` },
      { rule: 'Trades', detail: 'Players and draft picks may be traded. Picks are tradeable one year ahead only (current season and Y+1).' },
    ],
  },
  {
    section: 'Money',
    glyph: '💵',
    color: '#4ADE80',
    entries: [
      { rule: 'Auction budget', detail: `${$(AUCTION_BUDGET)} per team at the auction draft. This is the number that matters before the draft.` },
      { rule: 'In-season cap', detail: `${$(ROSTER_CAP)} is a luxury-tax THRESHOLD on drafted and kept salary — not a budget. Waiver-wire players are exempt from the count.` },
      { rule: 'TAX DAT ASS', detail: `Exceeding ${$(ROSTER_CAP)} costs ${$(LUXURY_TAX_PER_TEAM)} to every other team — ${$(LUXURY_TAX_TOTAL)} total — payable within 24 hours. Unpaid, the triggering trade is voided and the team takes a 100-point penalty each week until settled.` },
      { rule: 'Low Points Parlay', detail: 'The lowest-scoring team each week pays $10 into the weekly parlay.' },
    ],
  },
  {
    section: 'Keepers',
    glyph: '🔒',
    color: '#38BDF8',
    entries: [
      { rule: 'Escalation', detail: `A kept player’s price rises each season by ${$(KEEPER_ESCALATION_STEP)} × the number of years he has been kept. A $1 rookie goes $1 → $6 → $16 → $31.` },
      { rule: 'Contract length', detail: 'There is no hard limit on how long a player may be kept. The escalating price is the only brake.' },
      { rule: 'Rookie salaries', detail: 'Round 1 rookie picks cost $2; Round 2 picks cost $1.' },
      { rule: 'Keeper deadline', detail: 'Keepers are declared before the auction draft. Anything not kept returns to the auction pool.' },
    ],
  },
  {
    section: 'Season & Playoffs',
    glyph: '🏆',
    color: '#A855F7',
    entries: [
      { rule: 'Regular season', detail: `${REGULAR_SEASON_WEEKS} weeks.` },
      { rule: 'Playoff field', detail: `Top ${PLAYOFF_TEAMS} teams qualify.` },
      { rule: 'Opponent selection', detail: 'Higher seeds select their playoff opponent rather than playing a fixed bracket.' },
      { rule: 'Seeding bonus', detail: `${SEEDING_BONUS_PER_WIN} points per extra regular-season win over the opponent, applied in playoff matchups.` },
    ],
  },
  {
    section: 'Rules for the Rules',
    glyph: '⚖️',
    color: '#E63946',
    entries: [
      { rule: 'Threshold', detail: `A proposal needs at least ${VOTES_TO_PASS} of ${fantasyTeams.length} yes votes to be eligible to pass.` },
      { rule: 'One per category', detail: 'Only one rule from Scoring, Starters or Money may pass per year — the eligible proposal with the most votes. Operations is unlimited.' },
      { rule: 'Two rounds', detail: 'Voting runs in two rounds. Ties for a category lead are broken by the Rules Committee (Zurek, Taylor, Hogan).' },
      { rule: 'Effective date', detail: 'Scoring, Starters and Money changes take effect the following season. Operations changes take effect immediately.' },
      { rule: 'Two-year ban', detail: 'A proposal rejected in two consecutive years may not be resubmitted for two years after the second rejection.' },
    ],
  },
]

/**
 * The ten 2026 proposals — Title · Years Proposed · Proposed By ·
 * Description, verbatim from Keeper Master p15. Categories assigned per
 * §Rule Categories. Where p15 lists no year count, it's a first-year
 * proposal (yearsProposed: 1).
 *
 * Each carries a stable `seedId` so Admin re-seeding updates in place
 * instead of duplicating.
 */
export const proposals2026 = [
  {
    seedId: '2026-parlay-pot',
    title: 'Low Points Parlay Pot',
    category: 'Money',
    proposedBy: 'Bill / M. Zurek',
    yearsProposed: 1,
    summary: 'Lowest weekly score pays $10 to a pot, awarded to the playoff team with the lowest regular-season points among the final four.',
    changes: [{ rule: 'Weekly $10 low-score payment', currentValue: 'Funds the weekly parlay', newValue: 'Pot to final-four team w/ lowest reg-season points' }],
  },
  {
    seedId: '2026-trade-auction-dollars',
    title: 'Trade Auction Dollars During Off-Season',
    category: 'Money',
    proposedBy: 'Jason',
    yearsProposed: 1,
    summary: 'Allow trading future auction dollars in the off-season before the draft.',
    changes: [{ rule: 'Auction dollars tradeable', currentValue: 'No', newValue: 'Yes, off-season before draft' }],
  },
  {
    seedId: '2026-remove-dst',
    title: 'Remove D/ST',
    category: 'Starters',
    proposedBy: 'Faybik',
    yearsProposed: 2,
    summary: 'Eliminate Team Defense/Special Teams from lineups and the player pool.',
    changes: [
      { rule: 'D/ST starting slot', currentValue: '1', newValue: '0' },
      { rule: 'D/ST in player pool', currentValue: 'Yes', newValue: 'Removed' },
    ],
  },
  {
    seedId: '2026-remove-k',
    title: 'Remove K',
    category: 'Starters',
    proposedBy: 'Faybik',
    yearsProposed: 3,
    // p15: "Rule expiration limit hit — 2 year ban (2027 first year eligible)".
    // Last two rejections were 2023 and 2024 → banned 2025–26, eligible 2027.
    rejectionYears: [2023, 2024],
    summary: 'Rule expiration limit hit — two-year ban, 2027 first year eligible.',
    changes: [{ rule: 'Kickers in the league', currentValue: 'In player pool', newValue: 'Removed' }],
  },
  {
    seedId: '2026-faab-trading',
    title: 'FAAB Trading',
    category: 'Money',
    proposedBy: 'Jason',
    yearsProposed: 1,
    summary: 'Permit trading of Free Agent Acquisition Budget during the season.',
    changes: [{ rule: 'FAAB tradeable', currentValue: 'No', newValue: 'Yes, in-season' }],
  },
  {
    seedId: '2026-week-18-adds',
    title: 'Add/Drops Week 18',
    category: 'Operations',
    proposedBy: 'Jason',
    yearsProposed: 1,
    summary: 'Extend player pickups/drops through Week 18 (currently ends Week 17).',
    changes: [{ rule: 'Transactions end', currentValue: 'Week 17', newValue: 'Week 18' }],
  },
  {
    seedId: '2026-draft-unsigned',
    title: 'Draft Unsigned / College Players',
    category: 'Operations',
    proposedBy: 'Foley',
    yearsProposed: 1,
    summary: 'Allow drafting unsigned NFL/college players, not counting toward roster limits until signed, with standard price increases.',
    changes: [
      { rule: 'Rookie draft eligibility', currentValue: 'NFL rostered only', newValue: 'Includes unsigned / college' },
      { rule: 'Roster count until signed', currentValue: '—', newValue: 'Exempt until signed' },
    ],
  },
  {
    seedId: '2026-lottery-expansion',
    title: 'Draft Lottery Expansion',
    category: 'Operations',
    proposedBy: 'M. Zurek',
    yearsProposed: 1,
    summary: 'Expand the lottery to the bottom 5 teams (20% chance at the #1 pick) instead of the bottom 4 (25% each).',
    changes: [{ rule: 'Lottery teams', currentValue: 'Bottom 4 (25% each)', newValue: 'Bottom 5 (20% each)' }],
  },
  {
    seedId: '2026-legal-lineup',
    title: 'Require a Complete, Legal Lineup',
    category: 'Operations',
    proposedBy: 'Jason',
    yearsProposed: 1,
    summary: 'Require that teams set a complete, legal lineup each week.',
    changes: [{ rule: 'Invalid lineup', currentValue: 'Commissioner correction only', newValue: 'Required weekly, with penalty' }],
  },
  {
    seedId: '2026-dst-floor',
    title: 'Non-Negative D/ST Scoring',
    category: 'Scoring',
    proposedBy: 'Jason',
    yearsProposed: 1,
    summary: 'Change D/ST scoring so it can’t be negative — if we don’t remove D/ST or change the lineup requirement, this at least makes it so nobody ever punts D/ST.',
    changes: [{ rule: 'D/ST minimum weekly score', currentValue: 'Can go negative', newValue: '0' }],
  },
]
