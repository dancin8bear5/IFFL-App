// articles — every edition of every long-form piece the app has published.
//
// This is the list that makes retirement automatic. The Dashboard shows the
// NEWEST edition of each kind and the archive holds the rest, so publishing
// the 2027 rankings retires the 2026 ones in the same edit. There is no date
// to set and no switch to remember — which is the whole point, because a
// switch nobody remembers is how a preseason document is still leading the
// Dashboard in March.
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
