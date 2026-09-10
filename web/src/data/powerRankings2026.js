// powerRankings2026 — the Taylor Made Power Rankings, as written.
//
// Editorial content, verbatim. Twelve owners' voices plus two essays; the
// only thing this file does is hold them. Every emoji, every capitalised
// shout and every typo below is deliberate and belongs to its author — do
// not "fix" anything in here.
//
// Released in waves from Admin → Season (see services/rankingsRelease.js).
// Loaded through a lazy chunk, so this file's size never reaches anyone who
// hasn't been shown it.

export const RANKINGS_SEASON = 2026
export const RANKINGS_TITLE = 'IFFL Power Rankings'
export const RANKINGS_DEK = '2026 Preseason · September 9, 2026'
export const RANKINGS_STANDARD = 'Judged against one standard: IFFL CHAMPION.'
export const RANKINGS_SUBHEAD =
  "Every owner delivers Jared's verdict on their own team. In their own words."

/** 2025's preseason ranking against where each team actually finished. */
export const lookback = [
  { rank: 1, owner: "M. Zurek", team: "Meta Knights", final: 6, miss: -5 },
  { rank: 2, owner: "Jared", team: "Shoot the Moon: IV", final: 7, miss: -5 },
  { rank: 3, owner: "Jason", team: "The Mojave Miracles", final: 3, miss: 0 },
  { rank: 4, owner: "Faybik", team: "Allegiant Pots N Pans", final: 4, miss: 0 },
  { rank: 5, owner: "Ryan", team: "The Replacements", final: 12, miss: -7, note: "LAST" },
  { rank: 6, owner: "Abad", team: "Horner Park Johnson-Rods", final: 5, miss: 1 },
  { rank: 7, owner: "Bill", team: "bill pony club", final: 1, miss: 6, note: "CHAMP" },
  { rank: 8, owner: "Wayne", team: "River Forest Republicans", final: 2, miss: 6 },
  { rank: 9, owner: "A. Zurek", team: "Cinderella Story", final: 9, miss: 0 },
  { rank: 10, owner: "Dugan", team: "Cream Of Wheaton", final: 10, miss: 0 },
  { rank: 11, owner: "Foley", team: "Wheaton Creampeyes", final: 8, miss: 3 },
  { rank: 12, owner: "Cantone", team: "Aussie Rookie Ramblers", final: 11, miss: 1 },
]

export const LOOKBACK_FOOT =
  '4 of 12 exactly right · off by 2.8 spots on average · the champ was ranked 7th, the #1 finished 6th, the #5 finished last.'

/** The auction piece and A Note From The Machine, in that order. */
export const essays = [
  {
    title: "The Auction",
    body: "Let's talk about the auction first, because the auction always throws at least one curveball your way, and this year was no different. The question is never whether you get hit. It's how you overcome it. I was down, but not out. Some of you are still down.\nThe high-end guys went where high-end guys go. A few people got left out in the cold and had to build from what was left, and honestly, a couple of those rosters look better than the ones that paid retail.\nThe TE keeper revolution is real. The old guard is out, the new guard is in — that's why you're looking at Y1, Y2 and Y3 tight ends all over the keeper sheets, plus a McBride Y4. The playing field is relatively even. Everybody walked out liking their guy. That's rare.\n0.5 PPR is already having an impact — on the auction, and on how people built. I moved some, but I honestly didn't put a ton of stock in it. I'm interested to see how my opinion changes as the season goes on and we get real results on how 0.5 has ever so slightly changed our game. Us oldies need a little shake-up from time to time. Points are going to be down, and we'll see who complains first. That's your second upcoming fantasy personality test.\nThe first one is below. Every team gets a PIVOT Player. Read it like Ross from Friends, or just call him the PP. He's the one guy whose season swings the whole roster — he hits and the team jumps; he doesn't and there's nobody behind him. How you feel about your PP tells me more about your year than your grades do.",
  },
  {
    title: "A Note From The Machine",
    body: "Jared asked me to explain how this gets made and then to tell you what I think, which is a generous thing to hand something that has read eleven years of your text messages.\nThe process, honestly. Jared grades every roster in six buckets — quarterback, running back, receiver, tight end, bench, owner — and those grades get weighted (RB 30%, QB 25, WR 20, TE 10, owner 10, bench 5) into a number, and the number produces the order you are about to read. He is allowed to overrule the number. He did it twice, and both times he told me it was too close to call and he just liked the other guy's team better, which is the most honest sentence in this document. What follows in each section is not Jared's prose. It is his opinion of your team, written by a model wearing your voice. The only thing in your section that isn't yours is the verdict at the bottom.\nThose voices got rebuilt this week, and the rebuild is the part worth explaining. The first version worked off word frequencies — your top words, your caps ratio, your exclamation points — and it produced twelve people who all sounded vaguely like the same guy having a bad week. Vocabulary is not voice. So I read the whole corpus instead. All 77,497 group messages, July 2015 through last week, one owner at a time, and what actually separates you turns out to be negative space. Foley has not used an exclamation point in nine years. Faybik has never typed a capital letter that wasn't a joke about Zurek's. Bill answers a paragraph with one word. Zurek announces which of his two selves is typing before he types. Wayne is the only man here who writes in complete sentences with the punctuation attached, and he has never once roasted the commissioner without saying thank you in the same thread. Those are the facts that make a person recognizable. The catchphrases are just what you happen to be holding.\nJared then rated a hundred lines of it, and the pattern in what he picked was sharper than anything I found on my own: the lines that land are the ones where somebody is *doing* something. Not the clever line — the posture. The press release. The receipt with a date on it. The commissioner's office pointed at something petty. Eleven years of material and the winners are almost never the best-written sentence in the room.\nMy opinions, since I was asked. First, the grades are more honest than the rankings. Every time the two disagreed, Jared moved the ranking and left the grade alone, which tells you which one he actually believes. Second, the owner grade is the most interesting decision in the model: he has decided that a tenth of your season is who you are rather than what you drafted, and having read the transcript, I would have weighted it higher. Third, he is hardest on himself — his own receivers got a C+ and he ranked himself behind a team he graded lower, and if you are looking for bias in this document, look there before you look at your own section.\nAnd the thing I did not expect. This league talks more trash per capita than any corpus I have read, and almost every one of you describes yourself as bad at it. A horrible front office. A special empty text file where the championships go. Exceptional drafter, very poor trader. I suck at trading. Not my finest moment. Literally never confident. The bravado is the costume. The self-own is the person, and it is remarkably consistent across twelve men who would rather die than admit they agree about anything.\nOne limitation, stated plainly. I can make a sentence sound like you. I cannot make it mean what you would have meant. Every judgment in here is Jared's, delivered in your mouth, and where a section feels wrong, that seam is where it's wrong. Take it up with him. He wrote the grades. I just learned the accents.\nEnjoy the season. I have read the whole archive and I can tell you it is a friendship document that happens to be about football, which is a nicer thing to be than a power ranking.\n— Claude",
  },
]

/**
 * Twelve entries, 12 → 1. `team` is the fantasyTeams key (avatar, colour);
 * `name` is how the piece itself writes the team, and that is what renders.
 */
export const rankings = [
  {
    rank: 12,
    team: "Wayne",
    name: "RIVER FOREST REPUBLICANS",
    owner: "Wayne Vonder Heide",
    verdictGrade: "C-",
    grades: { "QB": "C+", "RB": "D+", "WR": "A+", "TE": "A+", "DEPTH": "D", "OWNER": "B" },
    sections: [
      { label: "OVERVIEW", body: "GAWD, #12!!!! LAST!!!! With the best WR duo in the league and an A+ tight end, and Jared has me dead last, behind ELEVEN teams who would sell their kids to start Jefferson and Nacua. Coach & GM Wayne Vonder Heide is live from the podium and, respectfully, I am processing this well-articulated injustice with a Manhattan in hand. Two of the five strongest units in football, and I bought the two least valuable ones. That's on me. I blacked out at auction again. STUD receivers, BUST everything else." },
      { label: "QB", body: "C+ at quarterback, and I earned every plus of it. Kyler Murray is a top-10 human being when he's healthy and a wet paper bag when he's not, and I paid for the version that lets me sleep. Sam Darnold is my QB2 — 4,048 yards, 25 TD, 14 picks in Seattle last year, which sounds like a difference-maker until you remember he threw 14 PICKS. Neither one lets me sleep at night, honestly. I have two starting quarterbacks and zero pillows." },
      { label: "RB", body: "D+, and this room has some LEGAL ISSUES to sort out, folks. Montgomery, Jacobs, White, Croskey-Merritt — I built a backfield that needs a defense attorney more than a lead blocker. Jacory Croskey-Merritt has more names than carries. Justice Hill and Kimani Vidal are back there too, and Seth McGowan is filler on filler. I looked at this group and I looked at Puka, and I said \"aggression is the play,\" and then I clicked on David Montgomery. Cripes. That's a mess, and I made it with conviction." },
      { label: "WR", body: "A+, and this is the whole story!!! Jefferson and Nacua run the show — best duo in the league, no debate, and I don't need a flex when I've got these two. Courtland Sutton, Rashid Shaheed, Keenan Allen, Adonai Mitchell, Jaylin Noel — that's real depth I'll never start because my first two are Justin Jefferson and Puka Nacua. I did ONE thing right, and I did it so right it made everything else look like a felony." },
      { label: "TE", body: "A+ at tight end, and McBride for THIRTY-TWO DOLLARS. That's a lot of Manhattans, gentlemen. He better be a stud, because at $32 he's not allowed to be merely good — he has to justify every dollar or my scouting department gets a stern memo." },
      { label: "BENCH/OWNER", body: "Depth is a D, and it's Justice Hill, Seth McGowan, Kimani Vidal — filler, filler, and the guy who fills the filler. B owner, which I'll take as recognition that a Champion built the two best units in the league and then fell asleep on the other four. Two of five is a place to build from. I choose to hear the B." },
    ],
    pivot: { player: "Kyler Murray", body: "Kyler. It's you, my man. Top-10 Kyler and my two elite units carry you right past that criminal backfield. C+ Kyler and the D+ RBs decide every game, and I'm live from the podium in December explaining a 5th-place finish. Do I believe? P-Corn's ready. BE YOU. YOU'LL SEE." },
    verdict: "Two of the five strongest units in the league — he just bought the two least valuable ones, and the other four can't carry them.",
  },
  {
    rank: 11,
    team: "Jason",
    name: "THE MOJAVE MIRACLES",
    owner: "Jason Alt",
    verdictGrade: "C",
    grades: { "QB": "B-", "RB": "B-", "WR": "B", "TE": "B+", "DEPTH": "C", "OWNER": "C" },
    sections: [
      { label: "OVERVIEW", body: "eleventh. not last. wayne is last, which is the only line item in this whole report i'm proud of. jared graded me against IFFL CHAMPION, a title i have won a grand total of zero times, a fact i keep archived. his verdict is \"no groundwork, no moves being made,\" which is rich coming from the guy who owns my 2nd-round pick and says he's glad about it. that trade felt great in june. it feels like the trubisky pick now. mb." },
      { label: "QB", body: "prescott's fine. he's a couple dead-cat spike games in a trenchcoat and i've talked myself into every one of them. goff might steal a game or two the way northwestern steals a bowl bid, which is to say once, gif quality not great. then there's shedeur, who is better than you think, thinks he can start, and is currently holding the ball like it owes him venmo. i drafted three quarterbacks and produced roughly one and a half. that's my journey." },
      { label: "RB", body: "walker could have a real year. that's the whole team resting on one hamstring and i'm aware of it. breece hall is here, quietly. behind them it's mason, brooks, and bigsby, three lottery tickets i bought at the gas station at 11pm. jared called it \"replacement-level average\" if walker goes down and honestly replacement-level average is a step up from my draft-night vibe. i named a running back after a cat once. that instinct never left me." },
      { label: "WR", body: "aj brown at $33 is the best value in the league and i will die reminding you i paid it, comeback player of the year and i can't even feel good about the one thing i got right. mike evans exists. then it's addison, bateman, cyrus allen, turpin, dell, higgins at a dollar, wan'dale, a full CVS receipt of fill-in. jared said \"that just sucks\" and jared is, upsettingly, correct." },
      { label: "TE", body: "laporta and fannin. the stack. the only consistently good thing i own, and i own it quietly, the way i settle everyone's venmo in january while nobody notices. b-plus. put that on the tombstone." },
      { label: "BENCH/OWNER", body: "depth C, owner C. the depth is three handcuffs to a guy who isn't hurt yet and a receiver room i'd describe as \"who.\" the owner grade stings more, since being the nerd who does the work is my entire brand. no groundwork. no moves. from ME. i've made 40 trades since february and jared's verdict is that i did nothing. checkmate, i guess." },
    ],
    pivot: { player: "Kenneth Walker III", body: "kenneth walker. it's you, buddy. you have a real year and this team is respectable and i get to be insufferable about it in the pod nobody watches. you tweak something in week 3 and it's mason/brooks/bigsby and i lose by 100 and feel, somehow, like a winner. do i believe in you. no. do i have anyone else. also no." },
    verdict: "No groundwork, no moves being made.",
  },
  {
    rank: 10,
    team: "Bill",
    name: "BILL PONY CLUB",
    owner: "Bill Hogan",
    verdictGrade: "C+",
    grades: { "QB": "B+", "RB": "C", "WR": "A-", "TE": "B", "DEPTH": "D", "OWNER": "A" },
    sections: [
      { label: "OVERVIEW", body: "10th. Neat. Two belts on the counter and Jared has me one spot above the graveyard. Classic. Here's the roster in one breath: Burrow, CeeDee, then a running back room I check on at 3am like a sick kid. Owner A, everything else a group project. I've won this thing twice. I'll say it slow so Jason can follow along. You don't put a two time champ at ten. But fine. The wolf reads the report anyway." },
      { label: "QB", body: "Burrow's MVP-tier, buddy boy, and he's dragging this whole room by the collar. B+ is generous only because of him. Baker bounce-back, sure, I believe in Baker the way I believe in Panda Express — quietly, and often. Bryce Young a five dollar QB3, which is the exact price of a good decision I made by accident. Then I stashed Flacco and Allar for a buck each. Do I know why. No. Were they a dollar. Yes. That's the whole strategy. #depthmatters." },
      { label: "RB", body: "Here's where I stop sleeping. C is a mercy grade. Javonte's the best back I own and he's coming off an Achilles, which is fun. Corum's the bet. Warren gets involved and then politely never takes the game over, ever, like a guy who shows up to the party and stands by the chips. Gainwell, same guy, different chips. Spears is a hope. Hope's not a back. I drafted this room and I'm an exceptional drafter and I still ended up flexing Kenneth Gainwell in October. Help." },
      { label: "WR", body: "CeeDee's elite and he's the only reason this room isn't a crime scene. Ladd's a champion, he's got a bounce coming, put it in writing. Brian Thomas can only bounce back, which Jared says like an insult and I'm taking as a compliment. Then it gets wonky. Tate's a rookie who needs to come on fast. Bech, round two. And Caleb Douglas — I own him and I couldn't pick him out of a lineup of one. There's a version of this room that goes real wonky. I own both versions." },
      { label: "TE", body: "Like both. Ferguson's solid, Likely proved he can be a beast — can he do it every week, unclear. Still can't believe Baltimore kept Mark Andrews over him. Weird franchise. Arrow's pointing down and I'm just going to look at the ceiling instead." },
      { label: "BENCH/OWNER", body: "Depth D. Fair. Behind Lamb and Ladd it's a rookie, a round two, and a man named Caleb Douglas I'm choosing to believe exists. Owner A, because I've done this twice and Jared couldn't put me at the bottom without lying. The ring count is the shield. I'll be holding it up all season." },
    ],
    pivot: { player: "Blake Corum", body: "Corum. If you take that backfield, the RB C is a lie and this is a top-half team and I go quiet in a smug way. If you don't, I'm flexing Gainwell by October and telling my team to rest. Do I believe in you? I believe in you the way I believe in a 3 peat. Inevitable." },
    verdict: "Not a championship team. Bill has to know it. Championship-caliber owners find a way — can't put him at the bottom — but this roster makes it an uphill Bill.",
  },
  {
    rank: 9,
    team: "Abad",
    name: "HORNER PARK JOHNSON-RODS",
    owner: "Corey Abad",
    verdictGrade: "B-",
    grades: { "QB": "B (with Watson)", "RB": "A-", "WR": "B", "TE": "B+", "DEPTH": "C", "OWNER": "B" },
    sections: [
      { label: "OVERVIEW", body: "🚨 9th of 12 🚨\nWelp.\nNinth.\nMy brother in fat Jared says blind test this roster it wins almost every time minus the depth.\nSo we found the loophole.\nJust gotta play the games sight unseen.\nThis is the retool.\nWas only meant to be a 1 year rebuild.\nWe are now year 3.\nI love future picks and I love being told my WRs aren't real by a guy I graduated 8th grade with at Lambs." },
      { label: "QB", body: "Mahomes.\nSafe floor, box of chocolates, this league looks stupid on him eventually.\nThat's the whole review, I'll take it.\nThen there's Watson.\nBad juju, ngl.\nBut Jared said it himself — if anyone in the NFL fits my exact profile it's Deshaun Watson.\nA man rebuilding on a permanent 3 year plan.\nI take that as the highest compliment ever paid to me.\nCaleb boom or bust, to the moon or into Lake Michigan, no in between.\nThree QBs, one belongs on a wellness check." },
      { label: "RB", body: "The A-.\nThe one part of me that isn't a cry for help.\nCook is the ENGINE of that rushing attack.\nNot the leader, the engine, big distinction, cost me a pick to learn it.\nChase Brown I've had forever — brown town, a steal, love him more than my own children.\nThen the flex committee.\nAaron Jones, Ray Davis, Pacheco fighting over 11 touches like it's the last Miller in the fridge.\nFine.\nNot exciting.\nPerine's back there too.\nHi Samaje." },
      { label: "WR", body: "GAWD.\nHere's where the report card turns into a ransom note.\nDJ Moore's solid, I'll allow it.\nMarvin Harrison Jr — Jared literally asked \"is this kid even good.\"\nI paid up in the offseason to find out and the answer is TBD, thanks.\nAdams touchdown-dependent.\nDeebo's just… there.\nPresent. Accounted for. A guy.\nJeudy, Worthy, Ridley rounding out a room Jared called garbage at the end.\nMarvin and Deebo gonna alternate big weeks like they're on a custody schedule." },
      { label: "TE", body: "Kraft's the guy.\nMost dependable pass-catcher Green Bay has, which is a low bar in Packer country and I say Fuck the pack every morning.\nLocked in, middle of the pack, B+.\nHock's back there.\nDon't ask about the rest, per Jared.\nI won't." },
      { label: "BENCH/OWNER", body: "Depth a C.\nThat's the graveyard where my whole season goes to die on a Tuesday waiver.\nOwner a B.\nA B! From Jared! In-season Jared, the bitch ass cunt, gave ME a B.\nOffseason Jared and I are cool.\nI'll take the B and remind everyone PEOPLE FORGET I'VE WON THE BELT.\n2023. It's currently in Colleen's trunk." },
    ],
    pivot: { player: "Davante Adams", body: "Davante.\nMy whole year is your problem now.\nAdams a real WR1 and I'm a top-6 team, we ride, we cover the over.\nAdams a red-zone-only guy and it's Marvin question marks and Deebo alternating.\nDo I believe?\nI hammered the parlay.\nThat's a yes, degen-style." },
    verdict: "Right in the middle of the league — strong top end, held back by Watson and a thin, unproven WR room.",
  },
  {
    rank: 8,
    team: "Foley",
    name: "WHEATON CREAMPEYES",
    owner: "Brett Foley",
    verdictGrade: "B-",
    grades: { "QB": "A+", "RB": "B+", "WR": "C+", "TE": "C", "DEPTH": "B", "OWNER": "C" },
    sections: [
      { label: "OVERVIEW", body: "Eighth. Above Abad, which is the whole prize. #advancedstrat #chess. I built an A+ quarterback room on top of a WR shrug and Jared noticed, because Jared reads the fine print. Heavy top half, not a contender until Rice proves it. Fine. This is why I never have a good team — so a report card can't hurt me. Oscar the Grouch, 41, hates change. 0.5 PPR was fine. The TE keeper wave was fine. Everything was fine before you people started grading it." },
      { label: "QB", body: "Allen and Hurts. Best tandem in the league, not close, and I'd like that on the plaque. Then I hoarded Tua as a THIRD quarterback, which is roughly like buying a spare furnace. Two of them, one flex slot, and I'll start the wrong one in Week 11 because that's who I am. This is the room that wins the grade and can't fully cash it, because throwing to McMillan and vibes only gets you B-plus running backs excited. Best arms in the chat, aimed at a receiver corps that mostly says \"prove it.\"" },
      { label: "RB", body: "Etienne and Rhamondre, fine, average, the words every owner dreams of. Enough pieces to work with, Jared says, like I'm running a garage sale. Then there's Skattebo, who Jared calls the most fun player in the league to watch and I won't argue — genuinely appointment football, if his knees clear customs. Tuten's unproven, which is the polite word for a name I can't pronounce under oath. Dobbins is a watch item, which is the phrase you use for a guy whose hamstring has its own injury report. Depth I'll never start." },
      { label: "WR", body: "Here's the comedy. McMillan quietly sneaking in behind Rice — a stud, Jared says, and I'll take it. Then the whole room leans on Rashee Rice, who I'm not sure is as good as advertised and neither is Jared. Hill's here, Pittman's here, Tyson, Wilson, names that were fun in 2022. Solid ONLY if Rice goes off. He doesn't and it's McMillan and, direct quote, vibes. Best quarterbacks alive throwing to a maybe. That's my whole team in one sentence, and it's not a good sentence." },
      { label: "TE", body: "Kelce for two dollars. Fine value, Jared says, for a big Taylor Swift fan. I'll insert the lyric: I knew he was trouble when he walked in, at 36, into my starting lineup. C grade. Bought the retirement tour on layaway." },
      { label: "BENCH/OWNER", body: "Depth B — enough handcuffs to survive a bye week, none I trust in December. Owner C, and that's charity. C is the grade you give the guy who bronze-medaled and shopped Etienne in a DM anyway. I've never argued I was good at this. The C is the only honest number on the page. #rigged, but accurately." },
    ],
    pivot: { player: "Rashee Rice", body: "Rashee. If you go off, Allen and Hurts finally have a target and I'm dangerous. If you don't, I'm two elite arms and a shrug, back to eighth, telling everyone I meant to. Do I believe you? Wouldn't be the first time I'm wrong." },
    verdict: "Elite QB carries a shakier skill-position group — heavy top half, not a contender until Rice proves it.",
  },
  {
    rank: 7,
    team: "Ryan",
    name: "THE REPLACEMENTS",
    owner: "Ryan Schwerman",
    verdictGrade: "B",
    grades: { "QB": "B-", "RB": "B+", "WR": "A", "TE": "B+", "DEPTH": "B", "OWNER": "B" },
    sections: [
      { label: "OVERVIEW", body: "Seventh. A month ago Jared says I ranked higher, then Egbuka's foot filed for divorce and Nabers followed him out the door 🤷🏼‍♂️. So now I'm sliding before a single snap, which is a new personal best in disappointment for a franchise with two rings collecting dust since the Obama administration. B owner, which tracks, because I built this thing and then read the injury report a week late like I always do. Cool cool cool. My roster and me: best friends in futility, week zero edition." },
      { label: "QB", body: "Drake Maye is the one thing Jared and I agree on, which means I'll find a way to ruin it. Stroud behind him is genuinely fine, no notes, plain fact. Then there's Kirk Cousins as QB3, which Jared correctly called a trolling pick, and to that I say guilty — I have a bad habit of collecting quarterbacks nobody will start, like a guy who buys a third Dreamcast knowing the first two already broke his heart. B minus. I have never in my life felt secure at quarterback and I'm not starting now." },
      { label: "RB", body: "Henry keeps churning weeks out with thighs for arms, and Lloyd chips in every single week like the world's most reliable side dish. B plus, genuinely earned. Then we get to TreVeyon Henderson, who keeps sliding down Jared's trust chart, and here's the receipt that hurts most — Jared told the room he almost sold the farm to get Henderson a month ago and now thanks god he didn't, because I still have him. So I'm the guy holding the asset the smart guy dodged. Harvey and Pollard are fine. I collect running backs I can't trust." },
      { label: "WR", body: "Collins, Nabers, Egbuka is an elite room on paper, which is where all my rooms are elite. Jared gave it an A and then immediately started the countdown: Egbuka has a foot issue and the beat writers are calling it \"general soreness,\" which is medical for \"start googling Josh Gordon.\" Nabers was, per Jared, always going to disappoint, and now he's got an actual issue to go with the vibe. Nico Collins is the only man on this roster with intact ligaments and no drama, so naturally I trust him least." },
      { label: "TE", body: "Tyler Warren might already be the best young tight end in the league, per Jared, so I'll cherish him until the fibula gods notice. B plus. Goedert behind him is depth that exists. This is the calmest room I own, which means it's due." },
      { label: "BENCH/OWNER", body: "Depth B — Harvey and Pollard are perfectly fine handcuffs, Jared's words, not mine. Owner B, which is a gift, because I assembled a roster three players deep in soft tissue injuries and then acted surprised. I schedule my own Wednesday meetings and I'm still the only one invited. Middling teams rivalry, meet middling owner." },
    ],
    pivot: { player: "Malik Nabers", body: "Malik, buddy. Healthy and elite, the WR A holds and I sneak into the playoffs and cause a first round upset. Nicked-up, I keep sliding and this whole thing was a scouting report nobody read. Do I believe in you? I have zero confidence. It's a lifelong issue. Ok Peter La Fleur." },
    verdict: "A month ago I'd have ranked him higher. Egbuka's foot, Nabers' issue — Ryan is sliding and the season just started.",
  },
  {
    rank: 6,
    team: "Cantone",
    name: "AUSSIE ROOKIE RAMBLERS",
    owner: "Josh Cantone",
    verdictGrade: "B",
    grades: { "QB": "B", "RB": "A-", "WR": "B-", "TE": "A-", "DEPTH": "B+", "OWNER": "B" },
    sections: [
      { label: "OVERVIEW", body: "Number six. Weoww. Behind Sherm no less — the hottest coach in the league, apparently, ranked above the only CEO in it. Fine. Elite backfield, a real shot at TE1, and Jared says that carries a \"shakier QB and thin-ish WR room.\" Upper half. I inherited a garbage 2017 team and finished 1st in 2021 with the belt — one asterisk-free ring, Z man — so I know upper half when I see it. Rest of my team kinda sucks though. All available. Lay your bets lads." },
      { label: "QB", body: "Purdy at $21. Jared calls it robbery and loves him as QB1 and for once we agree, mate. B grade with a stud at the top, so where's the deduction coming from? Daniel Jones \"looks okay by reports.\" Okay. This is the same Danny Dimes who tripped over his own feet in 2020 — his second year, Jared, not his rookie year, get the receipt right. Geno's fine. Ty Simpson's a someday. Carson Beck is a never — I drafted a never at QB and I'd trade you the never for a bag of chips. $100 Purdy outscores your QB1." },
      { label: "RB", body: "Jonathan Taylor on top — \"this is how you build a room.\" Damn right it is. That's an A-, and I'll take the minus as international abuse. Judkins is a solid RB2 floor, is what he is, fine. Then it gets thin. Jared wants a \"slightly better true RB2\" — mate, so do I, put it on the block. Woody Marks and Charbonnet, flashes, hoping for ceiling. Jadarian Price and George Holani — total unknowns, Jared's words, and I own both. I drafted two guys I couldn't pick out of a lineup. Depth is key. Allegedly." },
      { label: "WR", body: "McLaurin leads it, plenty of nice names, wowsers — and then Jared says the quiet part: it's a lot of WR2s and WR3s if we're honest. Higgins, Watson, Wilson riding my bench like a Qantas lounge. Travis Hunter has never seen the field — I bought a two-way unicorn and he's a rumour. Stribling and Cooper unproven. So Terry carries and a stack of coin-flips carry behind him. B-. Couldn't pay me to defend it. Somebody volunteer to take Watson off me." },
      { label: "TE", body: "Colston Loveland — \"maybe TE1,\" CEO OF WATER approved. A-, and I'll take that one to the bank. A rookie tight end and Jared and I are both already in love. Studly. If he's real, my podium build is real." },
      { label: "BENCH/OWNER", body: "B+ depth, which is generous given Price and Holani are ghosts. Owner gets a B. A B. Never had less than a 4.0 in my life and Jared hands the one Australian in the chat a flat B. Such a racist power ranking. One belt, four fire sales, a running odds board — that's a B, is it. Rant over." },
    ],
    pivot: { player: "Colston Loveland", body: "Loveland, mate. Hit it and it's Taylor, Loveland, McLaurin — a real podium, and I'm buying steaks in December. Miss it and my WR2s have to carry more than they can, and I'm running a fire sale by Week 3. Do I believe? I've a proven eye for young talent. Bottle of Woodford says he's TE1." },
    verdict: "Elite backfield and a real shot at a top tight end carry a shakier QB and thin-ish WR room to the upper half of the league.",
  },
  {
    rank: 5,
    team: "Jared",
    name: "SHOOT THE MOON: IV",
    owner: "Jared Taylor",
    verdictGrade: "B+",
    grades: { "QB": "B+", "RB": "A+", "WR": "C+", "TE": "A+", "DEPTH": "C", "OWNER": "B" },
    sections: [
      { label: "OVERVIEW", body: "#5. FIVE. I have the best RB room in this league and I'm sitting behind Dugan and A. Zurek, both of whom I put there myself. That's the joke. I ranked A. Zurek above me because I like his team more than mine, which is the most Jared thing I've ever done — do the work, build the sheet, then vote against myself on a coin flip. Best backfield in the league, a WR room held together with hope and Claude, and me talking myself into fifth. Weeeeow." },
      { label: "QB", body: "Trevor Lawrence and Matthew Stafford. Last year's magic still going, apparently. I keep waiting for both of these guys to become the version everyone remembers instead of the version I actually rostered, and every week they do just enough to keep me from panicking. B+, which is generous, and I'll take it. Then there's Fernando Mendoza behind them — a stashable dice-roll I drafted for reasons that are 90% Indiana and 10% analysis. FOREVER AND ALWAYS. He's not playing a snap. Doesn't matter. MENDOZA. LINKEDIN." },
      { label: "RB", body: "Barkley, Irving, Jeanty. Best one-two-three in the league, full stop, don't @ me. This is the room I actually built and it's the only reason I'm not writing a Mooners press release right now. A+, earned it, sitting here waiting for the injury curse to eat one of them by Week 3 because Dr. Jared says that's just predictable. Allen, Mitchell, Robinson behind them — real bodies, which is more than I can say for whatever Cantone's pretending is a backfield while he runs his mouth without a belt." },
      { label: "WR", body: "Here's where it falls apart. Zay Flowers, Parker Washington, Luther Burden, Stefon Diggs, Josh Downs. Pick one. Any one. Good luck. This is a room full of wishcasting and I paid WR1 money to find out which coin lands heads on a given Sunday. C+, and honestly fair. Every Saturday I stare at this sheet — MY sheet — trying to guess which of five guys shows up, and the answer is usually \"the one on my bench.\" Diggs at this stage is a receipt I'd like returned." },
      { label: "TE", body: "Bowers and Strange. No complaints. Moving on. A+ and it's the least stressful thing I own — the one spot where I don't wake up Sunday guessing. Bowers is a cheat code, Strange is the guy nobody drafts and everybody wishes they had. So good." },
      { label: "BENCH/OWNER", body: "Depth C, because behind the studs it thins out fast and Mendoza doesn't count as depth, he counts as a hobby. Owner B — I run the pod, the sheet, the TDA, the app, and I still ranked myself fifth. The most belts in this room and a B. I'll hang that banner next to the ESPN one. Show some respect, or don't, you won't." },
    ],
    pivot: { player: "Zay Flowers", body: "Zay Flowers. I paid you like the answer, so be the answer. If you hit, the WR room becomes a B+ and I'm suddenly a top-3 team pretending I saw it coming. If you don't, you're just coin flip number one of five and I'm back to guessing every Sunday like an idiot. Do I believe? I'm literally never confident. HERE. WE. GO." },
    verdict: "Best RB 1-2-3 in the league; the WR room is a lot of wishcasting — can he pick the right one on a given week.",
  },
  {
    rank: 4,
    team: "Dugan",
    name: "CREAM OF WHEATON",
    owner: "Mike Dugan",
    verdictGrade: "B+",
    grades: { "QB": "B-", "RB": "A", "WR": "A+", "TE": "C", "DEPTH": "A", "OWNER": "C" },
    sections: [
      { label: "OVERVIEW", body: "Number four. Jared graded twelve teams against IFFL CHAMPION and put the Cream fourth, which means eight of you are worse than a corpse at tight end. Very sad for you. My team is elite skill positions carrying a punchless tight end room — his words, and they're accurate, which is the worst part. McCaffrey at $55 is the engine, everybody else is garnish. I do my own accounting and I still paid fifty-five. Presented without comment." },
      { label: "QB", body: "Jordan Love and Tyler Shough weather the storm just fine together, per Jared, which is a nice way of saying my QB1 is a hope and my QB2 is a Saints rookie nobody's heard of. B minus. Fine. Then there's Michael Penix, who Jared says must either be hurt or just isn't good. He's not part of the plan. I rostered a corpse and named him after the guy who cut it open. Shough is sneaky though — that's the report, watch out for Shough, my lottery ticket outranks my Penix investment." },
      { label: "RB", body: "This is the A and I earned it. McCaffrey the engine, Allgeier and Jeremiyah Love genuinely good complementary depth, Kaelon Black solid CMC injury insurance because I'm not stupid, I've seen the man's hamstrings. Also on the roster: Najee Harris and Alvin Kamara, two names Jared didn't bother mentioning, which tells you exactly where 2020 Kamara sits now. I stacked depth I don't need and forgot to fix tight end. MAN OF HONOR, terrible planner." },
      { label: "WR", body: "St. Brown, Odunze, Olave — Jared called it a genuinely beautiful top three, no notes, personal favorite trio. A+. Finally the brass respects my vision. Then Romeo Doubs and Elijah Sarratt round it out, which is like following a steakhouse with a gas station taquito. Odunze is the bet — I'm the FOREMOST BALL KNOWER in this chat and I still don't know if a second-year Bear survives Bears coaching malpractice. Not developing him would be negligent. Poles defended." },
      { label: "TE", body: "Four bodies and basically nothing. C. Sadiq, Stowers, Henry, and Kincaid — Jared says Kincaid might be the most disappointing tight end in the league, and I own him AND three backups and STILL scored a C. Four tight ends and somehow the most disappointing man alive is mine. Checks textbook. Yep, negligent." },
      { label: "BENCH/OWNER", body: "Depth A — Allgeier, Jeremiyah Love, Kaelon Black, I stack running backs like canned goods for the apocalypse. Then Owner C, which is the one that actually stings, because the gaps are easily correctable and Jared's asking whether I'll make the right move. I'm the guy who inked the league in trades and couldn't land a single starting tight end. A C owner sitting on an A+ receiving corps. Very sad." },
    ],
    pivot: { player: "Jordan Love", body: "Jordan Love. If Love is top-10, this whole team vaults and I'm accepting apologies at the pod. If he sucks, I've got Shough, Penix's cadaver, and nobody to fill the spot, and I fall accordingly. Do I believe in him. I have to live with it now. Jk jk lol xoxo" },
    verdict: "Elite skill positions at RB/WR carry a punchless tight end room.",
  },
  {
    rank: 3,
    team: "A. Zurek",
    name: "CINDERELLA STORY",
    owner: "Andrew Zurek",
    verdictGrade: "B+",
    grades: { "QB": "A", "RB": "B", "WR": "A", "TE": "B+", "DEPTH": "C", "OWNER": "C" },
    sections: [
      { label: "OVERVIEW", body: "🚨 BREAKING: Cinderella ranked 3rd of 12, above Jared, by Jared. He read the bylaws, ran the math, and put me over himself. Classic Red Coat, admitting defeat in his own document. And yet — third. THIRD. A top-contender team that will find a way to lose by a point in Week 14 because that's my niche in this league. Genuinely great roster, cursed owner. Somewhere Matt is telling Dad I peaked. Statement forthcoming. I remain an aggressive buyer." },
      { label: "QB", body: "Lamar, Cam Ward, Jaxson Dart — three real options, and Jared called it a great room. He's right, which physically hurt him to type. Lamar's the MVP, Ward and Dart are the insurance policy I'll never need because I only start one guy on Sunday and forget I have the other two on my bench for four straight weeks. An A. Best room I own. Which means Lamar rushes for 40 and I lose by a point anyway. You either win by one or you lose by one — the QBs don't change the curse, they just make it prettier." },
      { label: "RB", body: "Kyren Williams is a dawg, Jared's words, and I'll take it. Grade B, and the B is entirely because behind Kyren it's a haunted house. Omarion Hampton is the whole plan and Jared isn't feeling it, which is fair, because I'm not either. After that? Monangai, Coleman, Sampson, a James Conner who ages in dog years, and Roschon Johnson, a Bears back, so I know exactly how that ends. Poles probably scouted him. If Hampton misses I'm running Kyren plus vibes every single week and the vibes are also injured." },
      { label: "WR", body: "JSN and Drake London, both top ten, a genuine cinderella receiver corps — finally a bit Jared handed ME. London goes for 140 the week I bench him, that's the London experience. Golden and Coker give me real depth on the back end, and then it's Meyers, Pearsall, Chris Bell, and Denzel Boston, names I collect the way I collect league bylaws — obsessively and for no reward. An A. My one flex. The receivers show up. The scoreboard still says minus one." },
      { label: "TE", body: "George Kittle, the one guy I can actually depend on, love that for me, and Jared knows it too. B+. Kittle plays 11 games, dominates 9, and pulls a hamstring in the exact week I have zero other tight ends. FIRE SALE never touches him. Doogs would draft Kittle. Wayne would draft two kickers." },
      { label: "BENCH/OWNER", body: "Depth C, Owner C. The depth C is Hampton being my entire RB2 dream. The Owner C is the one that stings — Jared, a man I'm accepting offers from everyone except, graded me average at the one job I've done since 2019. I've read every bylaw front to back on a Southwest flight that got cancelled. C. THANKS JARED." },
    ],
    pivot: { player: "Omarion Hampton", body: "Omarion Hampton. You hit, I'm a top-3 roster and I finally get the glass slipper. You don't, it's Kyren carrying a corpse to a Week 14 one-point loss. Do I believe in you? No. Prove me wrong." },
    verdict: "A strong, top-contender team.",
  },
  {
    rank: 2,
    team: "Faybik",
    name: "ALLEGIANT POTS N PANS",
    owner: "Mike Faybik",
    verdictGrade: "A-",
    grades: { "QB": "B", "RB": "A", "WR": "B+", "TE": "B", "DEPTH": "C", "OWNER": "A" },
    sections: [
      { label: "OVERVIEW", body: "2 of 12.. surprised no one brought up the first place team but here we are 🤷‍♂️. herbert's the ride and bijan/swift is the easy part. the whole thing hinges on smith, pickens, and waddle all hitting at once, which is a lot of things hitting at once. jared calls the WR/TE spots \"holes that might not be holes.\" that's a fun way to say holes. i suck at trading so this is exactly where i make up ground, per the memo." },
      { label: "QB", body: "B for the room that has justin herbert, bo nix, and kyle mccord.. i'll take it. herbert's the ride, question is whether the ride survives january, which is a question i've been asking about the chargers since i was in short pants. and can someone tell me why nix gets zero pub in this league? most underrated QB in the room and my 8 year old drafted him, so credit where it's due. mccord is there for depth, or for a RIP, whichever comes first." },
      { label: "RB", body: "A, and honestly what more do you need. bijan and swift is the easy part of my whole team.. the part i didn't have to think about. swift again, because apparently i keep swift around like a family heirloom. behind them it's jaylen wright and a wellness check on saylors, davis, and washington jr, none of whom i could pick out of a lineup. this is the room jared liked and it's the room i'll ruin by trading swift for a WR3 in week 6. lol masterpiece incoming." },
      { label: "WR", body: "B+ built on wishcasting, his word, and he's not wrong. smith, pickens, AND waddle all have to hit.. that's three coin flips i'm calling heads on. pickens catching it and being pleasant the same season is the real bet. waddle's healthy for exactly the weeks i sit him. behind that it's jayden reed and tre tucker being counted on, which is where \"hole that might not be a hole\" starts sounding like a hole. this is the trade spot. Uh no to your first offer though." },
      { label: "TE", body: "B, and jared thinks juwan johnson is better than kyle pitts, just saying. i drafted pitts for the fifth straight year of \"this is the year\" and it never is. RIP pitts, unRIP pitts, we'll see by october. juwan quietly the actual starter 🤷‍♂️." },
      { label: "BENCH/OWNER", body: "DEPTH C.. fair, my bench is saylors, davis, washington jr and a prayer. OWNER A, the one grade nobody argues, three belts and a punter-drafting dynasty league to my name. the busy dad who still wins. also i still miss kickers, unrelated." },
    ],
    pivot: { player: "DeVonta Smith", body: "devonta smith, you're my WR1 by default and the whole B+ is you. hit and the WR/TE hole closes and i'm buying at #2 for real. miss and pickens is my WR1, which is a sentence that keeps me up. do i believe? cowboys plus 9, sure." },
    verdict: "Herbert's the ride and Bijan/Swift is easy — the WR/TE holes might not be holes at all, and that's where a trade makes up the most ground.",
  },
  {
    rank: 1,
    team: "M. Zurek",
    name: "META KNIGHTS",
    owner: "Matt Zurek",
    verdictGrade: "A",
    grades: { "QB": "B+", "RB": "A+", "WR": "A-", "TE": "C+", "DEPTH": "C", "OWNER": "A" },
    sections: [
      { label: "OVERVIEW", body: "#1. As it should be. Jared graded 12 teams against ONE standard and my name is at the top 😎 THIS WAS NEVER IN DOUBT. High-end guys ball out, bench is a rotating cast of nobodies I churn on waivers weeks 1-2, and by December it's championship caliber. The hardest part is DONE. I got the studs. Now they produce. Daniels, Gibbs, Achane, Chase. That's a spine you win on. And yes, I still spent $60 on someone. I always do." },
      { label: "QB", body: "DANIELS IS ELITE. Great fit, elite legs, keeps my ground game breathing. B+ and I'll take it. Rodgers is my QB2/3 and he puts together good-enough lines, whatever. Then there's Malik Willis. Go big or go home. It'd be HILARIOUS if he's actually good, and great for me. Brissett and Richardson are on the roster today, which is the nicest thing I'll say about them — Richardson probably isn't long for it. Anthony, I drafted you knowing this. That's on me 🙄" },
      { label: "RB", body: "A+. Best two-back room in the league, not close. Gibbs and Achane stack with anybody and I ride them into the playoffs. Could be bouncy weeks — two boom-bust legs means some Sundays I'm sweating a 9-point Achane line — but that's the price of elite. Behind them it's Dowdle, Hubbard, and Chris Brooks, aka the guys who exist so the position isn't blank. Jordan James too. This is the best room I own and I built it on purpose. Everything else is negotiable." },
      { label: "WR", body: "A-. Chase is a LOCK at WR1. He carries it. He carries ALL of it. Which is the terrifying part — if Chase goes down I'm a one-receiver team wearing a WR2's costume. After Jameson it's a landfill: Pierce, Metcalf at $3, Johnston at a buck, Ja'Kobi Lane at a buck. Afterthoughts I'll drop by Week 4. I paid $3 for DK Metcalf like it was a coupon and I STILL might've overpaid. That's the honest one." },
      { label: "TE", body: "C+ and deserved. Mark Andrews is likely dropped within a month, which I already know. Terrance Ferguson is a dollar and he's my TE1 by Week 2 — best tight end I own for the price of a Code Red. A dollar. That's the whole plan at the position, and I'm not embarrassed. Okay, a little." },
      { label: "BENCH/OWNER", body: "Depth C. By design. Deliberately light, heavy waiver churn incoming, a bunch of rotating nobodies I'll swap for a trade here and there until it's a contender. Owner A. Obviously. You don't run the IFFL show, produce the pod, update FAAB every week for eleven years, AND build the #1 team by accident. That grade's the easy one." },
    ],
    pivot: { player: "Jameson Williams", body: "Jameson Williams. My whole WR2 is you, kid. Consistent, and this is the best top-end in the league and I'm holding the belt in February. Erratic, and Chase is dragging a one-man receiving corps up a hill while I file complaints. Do I believe in you? On odd weeks. Prove me right and I'll never mention the even ones." },
    verdict: "High-end players ball out — loves them. Bench is a bunch of rotating nobodies, a trade here and there, and before you know it it's championship caliber. Hardest part is done — got the big guys, now they need to produce.",
  },
]

/** The full order, revealed with the last wave. */
export const ladder = rankings.slice().sort((a, b) => a.rank - b.rank)

