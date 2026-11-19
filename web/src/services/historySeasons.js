// historySeasons.js — which seasons the League History season picker offers.
//
// Every tab lists the COMPLETED seasons in leagueHistory. Player Scores also
// lists the season in progress: its weekly lines are added each Tuesday by
// web/scripts/scrape-espn-week.mjs (historyPlayerWeeks/{year}-{WW}, plus a
// season-to-date historyPlayerSeasons/{year}) long before the season has a
// leagueHistory standings doc.
//
// Pure, and `now` is an argument, so the boundaries are testable.

// The NFL season runs September → early February. Jan–Feb belong to the
// previous year's season; March–August there is no season in progress.
export function inProgressSeason(now = new Date()) {
  const m = now.getMonth() // 0 = January
  if (m >= 8) return now.getFullYear()
  if (m <= 1) return now.getFullYear() - 1
  return null
}

// Tabs whose data exists for the season in progress.
const LIVE_SEASON_TABS = new Set(['playerScores'])

export function seasonsFor(categoryKey, leagueSeasons = [], now = new Date()) {
  // Number(null) is 0, so require a plausible year rather than just a finite number.
  const ys = new Set(leagueSeasons.map(Number).filter((y) => Number.isInteger(y) && y >= 2000))
  const live = inProgressSeason(now)
  if (LIVE_SEASON_TABS.has(categoryKey) && live != null) ys.add(live)
  return [...ys].sort((a, b) => b - a)
}
