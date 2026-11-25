// articles — every edition of every long-form piece the app has published.
//
// This is the list that makes retirement automatic. The Dashboard shows the
// NEWEST edition of each kind for its first TWO WEEKS (`publishedAt`), and
// the archive holds everything else — so publishing the 2027 rankings
// retires the 2026 ones in the same edit, and the 2027 ones retire
// themselves fourteen days later. No switch to remember, which is the whole
// point: a switch nobody remembers is how a preseason document is still
// leading the Dashboard in March. A new KIND (true records, say) gets the
// same treatment by being listed here — the rule is not per kind.
//
// METADATA ONLY. No prose is imported here: the rankings live in Firestore
// (per-drop documents — the embargo depends on unreleased writing never
// reaching a browser), and the odds live in data/odds/. Keeping this file
// content-free is what stops every screen that reads it pulling the whole
// corpus into its chunk.
//
// The odds metadata is therefore written twice — here and in the edition
// module. services/archive.test.js asserts the two agree, because the only
// real risk in a second copy is that it quietly stops matching.

const RANKINGS = [
  {
    id: '2026_preseason',              // the powerRankings/{edition} document id
    edition: '2026 Preseason',
    season: 2026,
    date: 'September 2026',
    // Decides when it leaves the Dashboard for the archive (two weeks after
    // this — services/archive.js). The month is known, the day is not, so
    // this is the 1st; give a new edition its real day.
    publishedAt: '2026-09-01',
    title: 'The Taylor Made Power Rankings',
    blurb: 'Twelve teams judged against one standard, each owner delivering the verdict on their own team in their own words.',
  },
]

const ODDS = [
  {
    id: '2026',                        // the season, which is how odds editions are keyed
    edition: '2026 Preseason',
    season: 2026,
    date: 'August 2026',
    publishedAt: '2026-08-01',         // month known, day not — see above
    title: '2026 Championship Odds',
    blurb: 'All twelve priced and sorted into tiers, from in it to win it down to the spoon.',
  },
]

/** Every edition, both kinds. Order within a kind does not matter — the season does. */
export const ARTICLES = [
  ...RANKINGS.map((a) => ({ ...a, kind: 'rankings' })),
  ...ODDS.map((a) => ({ ...a, kind: 'odds' })),
]

export const KIND_META = {
  rankings: { label: 'Power Rankings', glyph: '📊' },
  odds: { label: 'Championship Odds', glyph: '🎰' },
}
