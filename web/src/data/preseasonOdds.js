// preseasonOdds — the championship odds, as written for the league.
//
// Editorial content, verbatim. It was posted in the group chat, where it
// scrolls away in a day and can't be linked to; this puts it on the site
// instead. Every word, every ellipsis and every typo below is the author's
// and stays that way — the app supplies the layout and nothing else.
//
// Bundled rather than stored in Firestore: it is written once a year and
// ships with a deploy, like the milestone calendar and the trade history.
//
// `team` is the fantasyTeams key, used ONLY to look up that team's logo and
// colour. `name` is the team's name as the odds spell it, and that is what
// renders — the two differ on purpose (the odds say "Wheaton Creampies",
// staticData says "Wheaton Creampeyes", and the author's spelling wins).

/** The season these odds are for. The board retires itself after it. */
export const ODDS_SEASON = 2026

export const ODDS_TITLE = '2026 Championship Odds'

export const oddsTiers = [
  {
    key: 'win',
    // Headings are verbatim, including the aside and the ellipses.
    heading: 'In it to WIN it',
    aside: 'how is it I have to play the Top 3 all twice - WTF',
    glyph: '\u{1F3C6}',
    color: '#4ADE80',
    teams: [
      {
        team: 'Foley',
        name: 'Wheaton Creampies',
        odds: '3/1',
        body: `I am going to call it, this is the year for Brett. I think he wins it all. Let's start at the top, Josh Allen and Jalen Hurts give him 50 pts a week on average...with a standard deviation of 10pts....no one else has that on their roster from two players. So what else...well I think Brett has breakout candidates at RB and WR. I love Skattebo, Tuten, Tet, and Rashee. All of those guys could be Top 10 at their position. Will they be? NO, but I think at least two of them will be. It doesn't stop there, we then have the rookies, Lemon, Washington, and Tyson....any one of those could be Top 15 WR. I simply love this team. There are many pathways to success...the only risk here is the SOCIAL game. He is going to need to be in the chat and paying attention in order to wheel and deal his way to a championship if the injury bug hits.`,
      },
      {
        team: 'A. Zurek',
        name: 'Cinderella Story',
        odds: '4/1',
        body: `Well the name of this team says it all...could we see Andrew be the Cinderella Story of this league, from the bottom of the barrel in terms of history to the top....for my money, he will fall just short. I really don't have too much bad to say about this team. Dart and Jackson are a great QB room that will provide a consistent base, just like Allen and Hurts. JSN will likely be WR1 and I believe Hampton will emerge as a Top 10 RB. PErsonally, I think Kyren will struggle to be consistent with touches to Corum and others. I also think he is lacking a FLEX, and will need to be creative with trading to strengthen his team. Overall I really like this team.`,
      },
      {
        team: 'M. Zurek',
        name: 'Meta Knights',
        odds: '5/1',
        body: `Perennially a contender (NOT WINNER), and this year will be no different from this typically Zurek Star Studded lineup (Gibbs, Achane, Daniels and my boy Jamarr) filled with enticing (usually worthless in the end) trade bait. What I like about this team is not necessarily the obvious, but knowing this coach I can see the pieces he is going to trade for those in desperate need of a QB (queue Aaron Rodgers, Brisset, etc) in Week 4, or a RB/WR (queue Metcalf, Johnston, Pierce) that has had one or two good games going into Week 6. He is going to be in the playoffs and around the mark but don't take the short odds.`,
      },
      {
        team: 'Ryan',
        name: 'The Replacements',
        odds: '5/1',
        body: `Before the draft I thought Ryan had the best set of keepers on a value for money basis. I love the upside of Maye, Egbuka, Warren and Nabers, and he has them for bugger all. Add in some Derek Henry and the combo of Stroud/Nico and I think this could be my early pick to win it all. Having said that, Ryan seems to never quite put it all together, with trade hesitation and not wanting to let go. What I can say is he has the pieces, and if he plays his cards right anything worse than a Top 4 finish would be underachieving.`,
      },
      {
        team: 'Cantone',
        name: 'Aussie Rookie Ramblers',
        odds: '6/1',
        body: `A team void of today's stars outside of Jonathan Taylor, Cantone has assembled a team that to this handicappers eye has multiple pathways to success. With the exception of TE, there is depth at every position but the key to winning the belt for this team will be the emergence of tomorrow's stars...Judkins, Loveland, Price, etc. This team has trade bait a plenty, and depending on who thrives and dives, this team could compete come playoff time.`,
      },
      {
        team: 'Dugan',
        name: 'Cream of Wheaton',
        odds: '6/1',
        body: `The best of the old and the new anyone...CMC and Love, wow what a combo at RB. This could be epic, throw in some Amon RAMEN noodles and we are cooking. Doogs has assembled quite the go big or go home team here, and I think we will see some ups and downs. I will say if Shough and Love hold their own at QB, this team could win it all. I personally like Rome and Olave, so if this whole team stays healthy, Doogs will contend, if not, he has pieces to trade and be ready for NEXT YEAR. To be noted, absolutely zero bench depth on this team unless one of his rookies break out big time.`,
      },
      {
        team: 'Jared',
        name: 'Shoot the Moon',
        odds: '7/1',
        body: `What could have been for Jared...man I think he really f*&ked up on draft day. Still Jared has a team that will compete and could ultimately win it all. I don't believe it will be because of Mendoza or the Jacksonville Jaguars offense, but I think Jared has difference makers that can be Top 5 at every position. Stafford has the offensive weapons and defense to compete for MVP and was a steal at the trade deadline, Bowers will be TE1 or 2 (behind Loveland), Saquan is too good to not bounce back in the Top 5 RB's, and Luther Burden might be the best receiver on the Bears team. It falls away pretty quick, but I like the bones of this team and he is going to have assets to manoeuvre and stay competitive.`,
      },
    ],
  },
  {
    key: 'struggle',
    heading: 'On the STRUGGLE BUS...',
    glyph: '\u{1F68C}',
    color: '#F4A261',
    teams: [
      {
        team: 'Wayne',
        name: 'River Forest Republicans',
        odds: '8/1',
        body: `Can you say Top Heavy?! Puka, JJ, and McBride, together with a couple mid tier QB's are going to keep Wayne in every game, quite frankly will him enough to make the playoffs. The glaring issue the handicappers see here is the lack of an RB1 until Josh Jacobs returns...if he ever does. The Rachaad White experience isn't great and I don't believe Montgomery is RB1 material when Woody is playing so I just think Wayne will perennially struggle for consistency, particularly with stupid half point PPR bringing down the numbers of his stars.`,
      },
      {
        team: 'Abad',
        name: 'Horner Park Johnson Rods',
        odds: '10/1',
        body: `I am not as down on Corey's team as the ESPN rankings. Cook and Brown are studs and could both finish as Top 5 RB's, as could Mahomes and Caleb finish as Top 10 QB's. That is going to win Corey some games and I think he managed to find some good value in the late rounds of the draft to give him some pieces to manoeuvre into playoff contention.`,
      },
      {
        team: 'Bill',
        name: 'Bill Pony Club',
        odds: '11/1',
        body: `Seeing the team he has today, I was tempted to drop Billy Boy into the next category, but he is a savvy little bastard and who knows what this team could turn into. As it stands today, I see Billy's Championship run coming to an end with the lack of depth and trade bait in this squad. Burrow, CD, and Baker will keep him competitive, but Bill is going to need some breakouts from the likes of Corum and McConkey to put this team at the top. I just don't see it for this year, but know Bill will prep for a return to greatness in 2028.`,
      },
    ],
  },
  {
    key: 'spoon',
    heading: 'Competing for the WOODEN SPOON...',
    glyph: '\u{1F944}',
    color: '#E63946',
    teams: [
      {
        team: 'Jason',
        name: 'The Battle Cats',
        odds: '12/1',
        body: `This team has some upside, but it is going to need to come from the old guard...Mike Evans, AJ Brown and Breece (yes he is old in RB terms) are going to have to show up big time to complete this solid QB Room and my boy LaPorta. Unlike Faybik, there are at least a few things to like on the bench here and we all know Jason will be involved in the trade market as soon as Week 2 (that I admire).`,
      },
      {
        team: 'Faybik',
        name: 'Allegiant Pots N Pans',
        odds: '15/1',
        body: `It was a pleasure to draft without him and I am not even sure we will see this guy for the remainder of the season. Yes he has Bijan but beyond that this is a bunch of mid-tier guys holding up a roster that has no reserves of interest to speak of. The lack of depth on this squad is paralyzing.`,
      },
    ],
  },
]

/**
 * Every team on the board, in odds order, numbered 1-12. The rank is
 * positional — it is not in the source text and is not a claim the author
 * made, it is just where the entry sits on the board.
 */
export const oddsBoard = oddsTiers.flatMap((tier) =>
  tier.teams.map((t) => ({ ...t, tier })),
).map((t, i) => ({ ...t, rank: i + 1 }))
