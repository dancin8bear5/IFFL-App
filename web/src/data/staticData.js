// staticData — league constants sourced from the 2025 IFFL League Document
// and the 2026 IFFL Keeper Master List (see /root plan for provenance).

// fantasyTeams: master name, display color, beltWins (championships,
// 2008–2025), logo (GenAI artwork in /public/logos), plus the identity map
// from Keeper Master p17 — ESPN team name, GroupMe handle, owner, abbrev.
// The ESPN name is the key for roster reconciliation.
export const fantasyTeams = [
  { name: 'A. Zurek', color: '#DC2626', beltWins: 0, logo: '/logos/a-zurek.jpg',
    espnName: 'Cinderella Story',            groupMeName: 'Cinderella Story', owner: 'Andrew Zurek',      abbrev: 'TACO' },
  { name: 'Abad',     color: '#2563EB', beltWins: 1, logo: '/logos/abad.jpg',      // 2023
    espnName: 'Horner Park Johnson-Rods',    groupMeName: 'Johnson-Rods 3.0', owner: 'Corey Abad',        abbrev: 'JRDP' },
  { name: 'Bill',     color: '#16A34A', beltWins: 2, logo: '/logos/bill.jpg',      // 2024, 2025
    espnName: 'bill pony club',              groupMeName: 'B2B Champ',        owner: 'Bill Hogan',        abbrev: 'BILL' },
  { name: 'Cantone',  color: '#7C3AED', beltWins: 1, logo: '/logos/cantone.jpg',   // 2021
    espnName: 'Aussie Rookie Ramblers',      groupMeName: 'CEO OF WATER',     owner: 'Josh Cantone',      abbrev: 'ARR'  },
  { name: 'Dugan',    color: '#EA580C', beltWins: 0, logo: '/logos/dugan.jpg',
    espnName: 'Cream Of Wheaton',            groupMeName: 'Mike Dugan',       owner: 'Mike Dugan',        abbrev: 'DPGE' },
  { name: 'Faybik',   color: '#CA8A04', beltWins: 1, logo: '/logos/faybik.jpg',    // 2017
    espnName: 'Allegiant Pots N Pans',       groupMeName: 'Michael Faybik',   owner: 'Mike Faybik',       abbrev: 'PNP'  },
  { name: 'Foley',    color: '#BE185D', beltWins: 0, logo: '/logos/foley.jpg',
    espnName: 'Wheaton Creampeyes',          groupMeName: 'Brett Foley',      owner: 'Brett Foley',       abbrev: 'BF'   },
  { name: 'Jared',    color: '#0891B2', beltWins: 3, logo: '/logos/jared.jpg',     // 2018, 2019, 2020
    espnName: 'Shoot the Moon: IV',          groupMeName: 'Jared',            owner: 'Jared Taylor',      abbrev: 'MOON' },
  { name: 'Jason',    color: '#4338CA', beltWins: 0, logo: '/logos/jason.jpg',
    espnName: 'The Mojave Miracles',         groupMeName: 'Shadeson',         owner: 'Jason Alt',         abbrev: 'CATS' },
  { name: 'M. Zurek', color: '#0D9488', beltWins: 2, logo: '/logos/m-zurek.jpg',   // 2008, 2016
    espnName: 'Meta Knights',                groupMeName: 'Matt Zurek',       owner: 'Matt Zurek',        abbrev: 'ZHop' },
  { name: 'Ryan',     color: '#14B8A6', beltWins: 2, logo: '/logos/ryan.jpg',      // 2012, 2014
    espnName: 'The Replacements',            groupMeName: 'Ryan Schwerman',   owner: 'Ryan Schwerman',    abbrev: 'Ryan' },
  { name: 'Wayne',    color: '#92400E', beltWins: 1, logo: '/logos/wayne.jpg',     // 2022
    espnName: 'River Forest Republicans',    groupMeName: 'Wayne VH',         owner: 'Wayne Vonder Heide', abbrev: 'GOP' },
]

export const teamByName = Object.fromEntries(fantasyTeams.map((t) => [t.name, t]))

/** Active = one of the current 12 franchises; history-only names are former members. */
export const isActiveTeam = (name) => Boolean(teamByName[name])

/** Resolve an ESPN team name back to the master name (roster reconciliation). */
export const teamByEspnName = Object.fromEntries(
  fantasyTeams.map((t) => [t.espnName.toLowerCase(), t.name]),
)

// ── League money model (2025 League Document) ──────────────────
// $200 = auction budget each season — THE planning number pre-draft.
// $300 = luxury-tax THRESHOLD on drafted/kept salary only (waiver-wire
//        players are exempt). Crossing it costs $25/team = $275 total.
// $150 = FAAB budget, separate from the auction budget.
export const AUCTION_BUDGET = 200
export const ROSTER_CAP = 300
export const FAAB_BUDGET = 150
export const LUXURY_TAX_PER_TEAM = 25
export const LUXURY_TAX_TOTAL = LUXURY_TAX_PER_TEAM * (fantasyTeams.length - 1) // $275

// ── Roster construction (§Rosters Trades, Transactions and Lineups) ──
// 21 total: 9 starters + 10 bench + 2 IR.
export const ROSTER_SIZE = 21
export const STARTER_COUNT = 9
export const BENCH_COUNT = 10
export const IR_SLOTS = 2

/** Starting lineup — note there is no kicker slot. */
export const STARTING_LINEUP = [
  { slot: 'QB',   count: 1 },
  { slot: 'RB',   count: 2 },
  { slot: 'WR',   count: 2 },
  { slot: 'TE',   count: 1 },
  { slot: 'FLEX', count: 1, eligible: 'RB/WR/TE' },
  { slot: 'OP',   count: 1, eligible: 'Offensive Player Utility' },
  { slot: 'D/ST', count: 1 },
]

// Position colours, shared by the Big Board and the rookie draft board so
// a WR is the same blue in both. All four clear 5:1 against dark ink
// (#0B0F17), which is why cells that use them as a fill take dark text —
// white fails on every one of them.
export const POSITION_COLORS = { QB: '#D9A84E', RB: '#4FAE8B', WR: '#5F93D6', TE: '#C96B3C' }
export const POSITION_INK = '#0B0F17'

// ── Feature flags ─────────────────────────────────────────────
/**
 * F.M.K. — the swipe deck, the mutual-interest matching, the per-player
 * ratings and the League Interest counts.
 *
 * OFF for everyone, deliberately as a hard constant rather than the
 * Admin > Areas switch. That switch runs through areaEnabled(), which is
 * admin-exempt by design — so with it off the league lost F.M.K. but the
 * commissioner still saw it on every screen, which is not "hidden".
 *
 * Flipping this to true restores every F.M.K. surface at once. Nothing was
 * deleted: the swiper, the matching engine in marketEngine.js, the
 * playerFMK collection and its security rules are all still here and still
 * tested. This is the only line that has to change.
 *
 * The trade portal is NOT part of this — it lives in the same tab and the
 * league uses it weekly, so that tab stays, renamed "Trades".
 */
export const FMK_ENABLED = false

// ── Season structure ──────────────────────────────────────────
export const REGULAR_SEASON_WEEKS = 14
export const PLAYOFF_TEAMS = 8       // top 8 make the playoffs
export const PLAYOFF_ROUNDS = 3      // weeks 15–17
export const SEEDING_BONUS_PER_WIN = 5 // pts per extra regular-season win

// ── Keeper economics (§League Keepers) ────────────────────────
// Escalation verified 231/231 against 2025 Keeper Master.csv:
//   next year = current + ($5 × years kept)
export const KEEPER_ESCALATION_STEP = 5
export const WAIVER_KEEPER_VALUE = 2   // any waiver player, regardless of FAAB bid
export const WAIVER_CLEARS_REQUIRED = 2 // FAAB auctions a dropped player must clear
export const ROOKIE_SALARY = { 1: 2, 2: 1 } // round → salary
export const PRACTICAL_MAX_CONTRACT_YEAR = 6 // no hard cap; price is the brake
// Keeper-eligibility price line for off-season planning: anyone priced
// above this won't realistically be kept, so keeper analytics ignore them.
export const KEEPER_PRICE_MAX = 60

// ── Scoring (ESPN league 331652 — 0.5 PPR all positions) ──────
export const ESPN_LEAGUE_ID = '331652'
export const SCORING = {
  Passing: [
    { label: 'Passing yard', value: 0.04 },
    { label: 'TD pass', value: 4 },
    { label: 'Interception thrown', value: -2 },
    { label: '2pt passing conversion', value: 2 },
    { label: '300–399 yard game', value: 2 },
    { label: '400+ yard game', value: 4 },
  ],
  Rushing: [
    { label: 'Rushing yard', value: 0.1 },
    { label: 'TD rush', value: 6 },
    { label: '2pt rushing conversion', value: 2 },
    { label: '100–199 yard game', value: 2 },
    { label: '200+ yard game', value: 4 },
  ],
  Receiving: [
    { label: 'Receiving yard', value: 0.1 },
    { label: 'Each reception', value: 0.5, highlight: true },
    { label: 'TD reception', value: 6 },
    { label: '2pt receiving conversion', value: 2 },
    { label: '100–199 yard game', value: 2 },
    { label: '200+ yard game', value: 4 },
  ],
  'Team D/ST': [
    { label: 'Kickoff / punt / INT / fumble / blocked-kick return TD', value: 6 },
    { label: 'Each sack', value: 1 },
    { label: 'Blocked punt, PAT or FG', value: 2 },
    { label: 'Each interception', value: 2 },
    { label: 'Each fumble recovered', value: 2 },
    { label: 'Each safety', value: 2 },
    { label: '0 points allowed', value: 10 },
    { label: '1–6 points allowed', value: 7 },
    { label: '7–13 points allowed', value: 4 },
    { label: '14–17 points allowed', value: 1 },
    { label: '18–21 points allowed', value: 0 }, // not listed in ESPN settings → scores 0
    { label: '22–27 points allowed', value: -1 },
    { label: '28–34 points allowed', value: -4 },
    { label: '35–45 points allowed', value: -7 },
    { label: '46+ points allowed', value: -10 },
  ],
  Miscellaneous: [
    { label: 'Kickoff return yard', value: 0.04 },
    { label: 'Punt return yard', value: 0.04 },
    { label: 'Kickoff return TD', value: 6 },
    { label: 'Punt return TD', value: 6 },
    { label: 'Fumble recovered for TD', value: 6 },
    { label: 'Fumble lost', value: -2 },
    { label: 'Fumble return TD', value: 6 },
  ],
}

// ── Rule governance (§Rules for the Rules) ────────────────────
// A rule needs a minimum of 7 votes to be eligible for approval.
export const VOTES_TO_PASS = 7

// The four official categories. Only ONE rule from Scoring, Starters or
// Money may pass per year; Operations is unlimited and takes effect
// immediately rather than the following season.
export const RULE_CATEGORIES = [
  { key: 'Scoring',    glyph: '🎯', color: '#38BDF8', limited: true,  note: 'Player point settings' },
  { key: 'Starters',   glyph: '🏈', color: '#F4A261', limited: true,  note: 'Lineup requirements, player values, roster & position eligibility' },
  { key: 'Money',      glyph: '💵', color: '#4ADE80', limited: true,  note: 'League dues, payouts, financial regulations' },
  { key: 'Operations', glyph: '⚙️', color: '#A855F7', limited: false, note: 'Roster limits, rookie draft order, schedule, waiver process' },
]

export const categoryMeta = (key) =>
  RULE_CATEGORIES.find((c) => c.key === key) ??
  { key: 'Operations', glyph: '⚙️', color: '#A855F7', limited: false }

// ── League calendar (2026 dates, Keeper Master p1) ─────────────
//
// `date` is the DAY, kept at midnight so the "in N days" countdown is a
// whole-day difference. `time` is display only — a milestone with a start
// time shows it, one without simply doesn't, so nothing has to invent
// "12:00 AM" for a deadline that is really just a date.
export const milestones = [
  { name: 'Rookie Draft',       icon: '🎓', color: '#A855F7', date: new Date(2026, 6, 16) },  // Jul 16
  { name: 'Select Keepers',     icon: '🕐', color: '#06B6D4', date: new Date(2026, 7, 28) },  // Aug 28, 12pm CST
  { name: 'Auction Draft',      icon: '💰', color: '#F4A261', date: new Date(2026, 8, 1), time: '8:45p CST' },
  { name: 'NFL Kickoff',        icon: '🏈', color: '#22C55E', date: new Date(2026, 8, 9) },   // Sep 9
  { name: 'Trade Deadline',     icon: '⇄',  color: '#F97316', date: new Date(2026, 10, 18) }, // mid-Nov
  { name: 'Rosters Frozen',     icon: '🧊', color: '#E63946', date: new Date(2027, 0, 3) },   // Jan 3, 2027
]
