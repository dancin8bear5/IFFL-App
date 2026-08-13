// previewData — sample league data for the dev-only ?preview=1 mode.
// Never loaded in production: the import site is guarded by import.meta.env.DEV.
// Shapes match the Firestore documents exactly so views render identically.

export const previewPlayers = [
  { id: 'p1',  teamName: 'Jared',  position: 'QB', name: 'Patrick Mahomes',     prices: { 2026: 85, 2027: 102, 2028: 120 }, originalPrice: 40, purchaseYear: 2022, contractYearsRemaining: 2, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2022, nflTeam: 'Kansas City Chiefs' },
  { id: 'p2',  teamName: 'Jared',  position: 'RB', name: 'Christian McCaffrey', prices: { 2026: 72, 2027: 88, 2028: 104 }, originalPrice: 55, purchaseYear: 2023, contractYearsRemaining: 1, playerPool: 'Auction', tradeHistory: ['via Cantone'], isActive: true, acquiredSeason: 2023, nflTeam: 'San Francisco 49ers' },
  { id: 'p3',  teamName: 'Jared',  position: 'WR', name: "Ja'Marr Chase",       prices: { 2026: 64, 2027: 78, 2028: 92 },  originalPrice: 22, purchaseYear: 2021, contractYearsRemaining: 3, playerPool: 'Rookie Draft', rookieRound: 1, rookieDraftYear: 2021, tradeHistory: [], isActive: true, acquiredSeason: 2021, nflTeam: 'Cincinnati Bengals' },
  { id: 'p4',  teamName: 'Jared',  position: 'TE', name: 'Travis Kelce',        prices: { 2026: 48, 2027: 58, 2028: 68 },  originalPrice: 30, purchaseYear: 2020, contractYearsRemaining: 1, playerPool: 'Auction', tradeHistory: ['via Ryan'], isActive: true, acquiredSeason: 2020, nflTeam: 'Kansas City Chiefs' },
  { id: 'p5',  teamName: 'Jared',  position: 'QB', name: 'Jordan Love',         prices: { 2026: 14, 2027: 20, 2028: 28 },  originalPrice: 8,  purchaseYear: 2023, contractYearsRemaining: 2, playerPool: 'Free Agent', tradeHistory: [], isActive: true, acquiredSeason: 2023, nflTeam: 'Green Bay Packers' },
  { id: 'p6',  teamName: 'Bill',   position: 'WR', name: 'Justin Jefferson',    prices: { 2026: 88, 2027: 104, 2028: 122 }, originalPrice: 45, purchaseYear: 2022, contractYearsRemaining: 3, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2022, nflTeam: 'Minnesota Vikings' },
  { id: 'p7',  teamName: 'Bill',   position: 'WR', name: 'CeeDee Lamb',         prices: { 2026: 76, 2027: 92, 2028: 108 }, originalPrice: 38, purchaseYear: 2022, contractYearsRemaining: 2, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2022, nflTeam: 'Dallas Cowboys' },
  { id: 'p8',  teamName: 'Ryan',   position: 'QB', name: 'Josh Allen',          prices: { 2026: 82, 2027: 96, 2028: 112 }, originalPrice: 50, purchaseYear: 2021, contractYearsRemaining: 2, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2021, nflTeam: 'Buffalo Bills' },
  { id: 'p9',  teamName: 'Ryan',   position: 'RB', name: 'Saquon Barkley',      prices: { 2026: 68, 2027: 80, 2028: 92 },  originalPrice: 42, purchaseYear: 2024, contractYearsRemaining: 2, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2024, nflTeam: 'Philadelphia Eagles' },
  { id: 'p10', teamName: 'Abad',   position: 'WR', name: 'Tyreek Hill',         prices: { 2026: 70, 2027: 82, 2028: 94 },  originalPrice: 48, purchaseYear: 2023, contractYearsRemaining: 1, playerPool: 'Auction', tradeHistory: ['via Foley'], isActive: true, acquiredSeason: 2023, nflTeam: 'Miami Dolphins' },
  { id: 'p11', teamName: 'Wayne',  position: 'RB', name: 'Bijan Robinson',      prices: { 2026: 66, 2027: 78, 2028: 90 },  originalPrice: 25, purchaseYear: 2023, contractYearsRemaining: 3, playerPool: 'Rookie Draft', rookieRound: 1, rookieDraftYear: 2023, tradeHistory: [], isActive: true, acquiredSeason: 2023, nflTeam: 'Atlanta Falcons' },
  { id: 'p12', teamName: 'Foley',  position: 'WR', name: 'Stefon Diggs',        prices: { 2026: 18, 2027: 24, 2028: 30 },  originalPrice: 35, purchaseYear: 2021, contractYearsRemaining: 1, playerPool: 'Auction', tradeHistory: [], isActive: true, acquiredSeason: 2021, nflTeam: 'New England Patriots' },
]

export const previewPicks = [
  { id: 'dp1', season: 2027, round: 1, slot: null, currentTeamName: 'Jared', originalTeamName: 'Cantone', prices: { 2026: 8, 2027: 8 }, tradeHistory: ['via Cantone'], status: 'available' },
  { id: 'dp2', season: 2027, round: 2, slot: null, currentTeamName: 'Jared', originalTeamName: 'Jared',   prices: { 2026: 2, 2027: 2 }, tradeHistory: [], status: 'available' },
  { id: 'dp3', season: 2027, round: 1, slot: null, currentTeamName: 'Foley', originalTeamName: 'Foley',   prices: { 2026: 8, 2027: 8 }, tradeHistory: [], status: 'available' },
]

export const previewTrades = [
  {
    id: 't1', season: 2026, date: new Date(2026, 7, 1), status: 'completed',
    proposingTeamName: 'Jared', receivingTeamName: 'Ryan',
    assetsFromProposer: [{ assetType: 'player', assetId: 'x1', displayName: 'Davante Adams', teamName: 'Jared' }, { assetType: 'draftPick', assetId: 'x2', displayName: '2026 Round 2', teamName: 'Jared' }],
    assetsFromReceiver: [{ assetType: 'player', assetId: 'p4', displayName: 'Travis Kelce', teamName: 'Ryan' }],
    isHistorical: false,
  },
  {
    id: 't2', season: 2026, date: new Date(2026, 6, 24), status: 'completed',
    proposingTeamName: 'Bill', receivingTeamName: 'Cantone',
    assetsFromProposer: [{ assetType: 'player', assetId: 'x3', displayName: 'CeeDee Lamb', teamName: 'Bill' }],
    assetsFromReceiver: [{ assetType: 'player', assetId: 'x4', displayName: 'Justin Jefferson', teamName: 'Cantone' }, { assetType: 'draftPick', assetId: 'x5', displayName: '2027 Round 1', teamName: 'Cantone' }],
    isHistorical: false,
  },
  {
    id: 't3', season: 2026, date: new Date(2026, 7, 10), status: 'proposed',
    proposingTeamName: 'Jared', receivingTeamName: 'Foley',
    assetsFromProposer: [{ assetType: 'player', assetId: 'p5', displayName: 'Jordan Love', teamName: 'Jared' }],
    assetsFromReceiver: [{ assetType: 'draftPick', assetId: 'dp3', displayName: '2027 Round 1', teamName: 'Foley' }],
    isHistorical: false,
  },
  // Incoming offer TO Jared — exercises the offer banner, accept/counter flow,
  // and the mixed player+pick ESPN checklist
  {
    id: 't4', season: 2026, date: new Date(2026, 7, 12), status: 'proposed',
    proposingTeamName: 'Bill', receivingTeamName: 'Jared',
    assetsFromProposer: [{ assetType: 'player', assetId: 'p6', displayName: 'Justin Jefferson', teamName: 'Bill' }],
    assetsFromReceiver: [
      { assetType: 'player', assetId: 'p1', displayName: 'Patrick Mahomes', teamName: 'Jared' },
      { assetType: 'draftPick', assetId: 'dp2', displayName: '2027 Round 2', teamName: 'Jared' },
    ],
    notes: 'Jefferson for Mahomes plus your 2027 2nd. He wants out of Minny anyway.',
    isHistorical: false,
  },
]

export const previewMessages = [
  { id: 'm1', content: 'Auction draft is Aug 22 — get your keepers locked in by the 15th!', timestamp: new Date(2026, 7, 8) },
  { id: 'm2', content: 'Reminder: trade deadline is Nov 4 this year.', timestamp: new Date(2026, 7, 2) },
]

// FMK signals that produce a real mutual match: Jared↔Bill (Kelce $48 vs — no;
// use Chase $64 vs Lamb $76? diff 15.8% > 10%... use Jefferson 88 vs Mahomes 85: 3.4% ✓)
export const previewFMK = [
  { id: 'u1_Bill-Justin Jefferson', userId: 'u1', teamName: 'Jared', assetId: 'Bill-Justin Jefferson', assetName: 'Justin Jefferson', assetOwnerTeam: 'Bill', signal: 'marry' },
  { id: 'u2_Jared-Patrick Mahomes', userId: 'u2', teamName: 'Bill', assetId: 'Jared-Patrick Mahomes', assetName: 'Patrick Mahomes', assetOwnerTeam: 'Jared', signal: 'fuck' },
  { id: 'u3_Jared-Travis Kelce', userId: 'u3', teamName: 'Ryan', assetId: 'Jared-Travis Kelce', assetName: 'Travis Kelce', assetOwnerTeam: 'Jared', signal: 'fuck' },
  { id: 'u1_Ryan-Saquon Barkley', userId: 'u1', teamName: 'Jared', assetId: 'Ryan-Saquon Barkley', assetName: 'Saquon Barkley', assetOwnerTeam: 'Ryan', signal: 'fuck' },
]

export const previewHistory = [
  { id: '2025', season: 2025, champion: 'Bill', runnerUp: 'Jared', standings: [
    { teamName: 'Bill', place: 1, record: '11-3', pointsFor: 1893.4 },
    { teamName: 'Jared', place: 2, record: '10-4', pointsFor: 1847.2 },
    { teamName: 'Ryan', place: 3, record: '9-5', pointsFor: 1756.8 },
    { teamName: 'Abad', place: 4, record: '8-6', pointsFor: 1711.5 },
    { teamName: 'Wayne', place: 5, record: '7-7', pointsFor: 1654.3 },
    { teamName: 'Cantone', place: 6, record: '7-7', pointsFor: 1632.9 },
    { teamName: 'Faybik', place: 7, record: '6-8', pointsFor: 1598.1 },
    { teamName: 'M. Zurek', place: 8, record: '6-8', pointsFor: 1571.6 },
    { teamName: 'Foley', place: 9, record: '5-9', pointsFor: 1542.7 },
    { teamName: 'Dugan', place: 10, record: '5-9', pointsFor: 1478.4 },
    { teamName: 'Jason', place: 11, record: '4-10', pointsFor: 1421.9 },
    { teamName: 'A. Zurek', place: 12, record: '3-11', pointsFor: 1354.2 },
  ], notableTrades: ['Jared sends Kelce + 2026 R1 to Ryan for Josh Allen'] },
  { id: '2024', season: 2024, champion: 'Bill', runnerUp: 'Abad', standings: [
    { teamName: 'Bill', place: 1, record: '12-2', pointsFor: 1912.0 },
    { teamName: 'Abad', place: 2, record: '9-5', pointsFor: 1788.3 },
    { teamName: 'Foley', place: 3, record: '8-6', pointsFor: 1701.2 },
  ], notableTrades: [] },
  { id: '2023', season: 2023, champion: 'Abad', runnerUp: 'Wayne', standings: [
    { teamName: 'Abad', place: 1, record: '10-4', pointsFor: 1834.7 },
    { teamName: 'Wayne', place: 2, record: '9-5', pointsFor: 1790.1 },
    { teamName: 'Jared', place: 3, record: '9-5', pointsFor: 1745.6 },
  ], notableTrades: ['Abad lands Tyreek Hill from Foley at the deadline'] },
]

export const previewRules = [
  {
    id: 'rule1', season: 2026, status: 'passed', decidedSeason: 2026,
    title: 'Cap floor of $150', details: 'Every roster must carry at least $150 in total salary at season start.',
    proposedBy: 'Jared', proposedAt: new Date(2026, 5, 2),
    votes: { Jared: 'yes', Bill: 'yes', Ryan: 'yes', Abad: 'yes', Wayne: 'yes', Cantone: 'yes', Foley: 'yes', Dugan: 'no' },
  },
  {
    id: 'rule2', season: 2026, status: 'proposed',
    title: 'Ties broken by season points', details: 'Standings ties break on total points for instead of head-to-head.',
    proposedBy: 'Bill', proposedAt: new Date(2026, 7, 1),
    votes: { Bill: 'yes', Ryan: 'yes' },
  },
  {
    id: 'rule3', season: 2026, status: 'proposed',
    title: 'Two IR slots', details: 'Expand from one IR slot to two.',
    proposedBy: 'Wayne', proposedAt: new Date(2026, 7, 9),
    votes: {},
  },
  {
    id: 'rule4', season: 2025, status: 'failed', decidedSeason: 2025,
    title: 'Ban Thursday pickups', details: 'No waiver claims after Thursday kickoff.',
    proposedBy: 'Foley', proposedAt: new Date(2025, 8, 10),
    votes: { Foley: 'yes', Dugan: 'yes', Jason: 'yes' },
  },
]
