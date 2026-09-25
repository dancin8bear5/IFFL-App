// POD content — the preseason predictions segment of the league's show.
// Source: "2025 POD Rankings and Data" workbook, "Taylor Made Rankings"
// tab. Seeded here so the POD tab has real content on day one; the three
// hosts edit it in-app from there (saved to Firestore config/pod, which
// takes precedence over these values once written).

export const POD_PREDICTORS = ['Taylor Made', 'Bill', 'Zurek']

// Preseason team-by-team rankings, unveiled one team at a time on the show.
// ranks are keyed by predictor; `avg` is computed in the UI, not stored.
export const POD_RANKINGS_2025 = [
  { team: 'M. Zurek', ranks: { 'Taylor Made': 1, Bill: 2, Zurek: 2 } },
  { team: 'Jared', ranks: { 'Taylor Made': 2, Bill: 1, Zurek: 1 } },
  { team: 'Jason', ranks: { 'Taylor Made': 3, Bill: 3, Zurek: 4 } },
  { team: 'Faybik', ranks: { 'Taylor Made': 4, Bill: 6, Zurek: 5 } },
  { team: 'Ryan', ranks: { 'Taylor Made': 5, Bill: 5, Zurek: 6 } },
  { team: 'Abad', ranks: { 'Taylor Made': 6, Bill: 8, Zurek: 3 } },
  { team: 'Bill', ranks: { 'Taylor Made': 7, Bill: 4, Zurek: 8 } },
  { team: 'Wayne', ranks: { 'Taylor Made': 8, Bill: 7, Zurek: 10 } },
  { team: 'A. Zurek', ranks: { 'Taylor Made': 9, Bill: 10, Zurek: 9 } },
  { team: 'Dugan', ranks: { 'Taylor Made': 10, Bill: 12, Zurek: 12 } },
  { team: 'Foley', ranks: { 'Taylor Made': 11, Bill: 11, Zurek: 7 } },
  { team: 'Cantone', ranks: { 'Taylor Made': 12, Bill: 9, Zurek: 11 } },
]

// Award predictions. The workbook labels these columns Jared/Bill/Zurek
// (Jared === the "Taylor Made" ranking column) — kept as-is so the table
// reads the way the hosts already say it out loud.
export const POD_AWARD_PREDICTORS = ['Jared', 'Bill', 'Zurek']

export const POD_AWARDS_2025 = [
  { category: 'MVP', picks: { Jared: 'Bijan Robinson', Bill: 'Bucky Irving', Zurek: 'Jahmyr Gibbs' } },
  { category: 'Sleeper', picks: { Jared: 'Drake Maye', Bill: 'Jaylen Waddle', Zurek: 'Zach Charbonnet' } },
  { category: 'Bust', picks: { Jared: 'Jameson Williams', Bill: 'AJ Brown', Zurek: 'Rashee Rice' } },
  { category: 'Best Non-Rookie Value', picks: { Jared: 'David Montgomery', Bill: 'Charbonnet', Zurek: 'Alvin Kamara' } },
  { category: 'Worst Auction Value', picks: { Jared: "$24 left in Corey's pocket", Bill: 'Mahomes', Zurek: 'David Njoku ($12)' } },
  { category: 'ROY', picks: { Jared: 'Ashton Jeanty', Bill: 'TET', Zurek: 'Emeka Egbuka' } },
  { category: 'Cumback Player', picks: { Jared: 'Breece Hall', Bill: 'CMC', Zurek: 'Breece Hall' } },
  { category: 'Bears Season o/u', picks: { Jared: 'Under 8.5 (7)', Bill: 'Under 8.5', Zurek: 'Over 8.5' } },
]

// Five free-text bold predictions per host.
export const POD_BOLD_CALLS_2025 = {
  Jared: [
    'TLaw finishes above Baker Mayfield',
    "Mike Evans doesn't reach 1k yrd for 1st time",
    "Goff doesn't finish as Top 20 QB",
    'Rome Odunze is not a Top 24 WR',
    'JSN finishes as Top 3 WR',
  ],
  Bill: [
    'Jason is the first team to fire sale',
    'Burrow/Dak finish the as top 5 qbs and foley is still in the lottery.',
    'Jeanty finished outside the top 15 in ppg',
    'G Wilson finished as a top 5 wr',
    'Kraft is a top 5 te and has over 12 tds',
  ],
  Zurek: [
    'Tyler Warren Finishes as TE3',
    'Emeka Egbuka is top 12 WR',
    'Drake London EOS as WR1',
    'Baker outside top 12 QBs',
    'Bears MAKE the playoffs as 7 Seed',
  ],
}

export const POD_SEED_SEASON = 2025
