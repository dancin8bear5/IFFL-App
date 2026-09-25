// extract-rookie-history — recover every rookie draft class from the ESPN export.
//
// The league's rookie draft has never existed as its own event in ESPN. There
// is one draft per season in the export (228 rows = 19 rounds x 12 teams) and
// the rookie picks are hidden inside it, because a rookie taken in July is
// simply on the roster when the August auction happens. So a class has to be
// recovered by fingerprint, and the fingerprint has three parts:
//
//   1. THE PLAYER MUST BE AN ACTUAL NFL ROOKIE that year. Checked against
//      data/nfl-rookie-seasons.csv (nflverse, joined on ESPN player id) —
//      not against "first time we've seen him", which is wrong for anyone who
//      spent a year or two in the league before someone rostered him.
//
//   2. THE PRICE IS THE SLOT. Rookie contracts were a sliding scale through
//      2021 and flat from 2022:
//         2017-2021   $12=1.01  $10=1.02  $8=1.03  $6=1.04  $4=1.05
//                     $2=1.06-1.12 (round one, slot unknowable)
//                     $1=round two (slot unknowable)
//         2022-       $2=round one, $1=round two. No slots exist to recover.
//
//   3. HE MUST HAVE BEEN KEPT, NOT BOUGHT. $1 and $2 are also ordinary
//      auction prices, so this is what separates a 2nd-round pick from a
//      dollar flyer at the end of the auction — see keptRookies() below.
//
// The draft began in 2017 (Corey Davis, 1.01, the first rookie pick in league
// history). Earlier seasons throw up the occasional player at a ladder price;
// those are auction buys and are deliberately not searched.
//
// Usage (from web/):
//   node scripts/extract-rookie-history.mjs            # report + review queue
//   node scripts/extract-rookie-history.mjs --write    # also write the data file
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const HISTORY_CSV = join(ROOT, 'data/iffl_fantasy_history_2008-2025.csv')
const ROOKIES_CSV = join(ROOT, 'data/nfl-rookie-seasons.csv')
const IDENTITY = join(ROOT, 'data/espn-team-identity-map.json')
const OUT = join(ROOT, 'web/src/data/rookieDraftHistory.js')

export const FIRST_SEASON = 2017        // Corey Davis, 1.01
export const LADDER_LAST_SEASON = 2021  // flat $2 / $1 from 2022
export const SLOT_PRICES = { 12: '1.01', 10: '1.02', 8: '1.03', 6: '1.04', 4: '1.05' }
export const MAX_PICKS = 24

// Rulings from the commissioner where the data alone can't decide.
// Each one records a real event the export doesn't contain.
const RULINGS = {
  // Two players sat at $4 with only one 1.05 to give. Ronald Jones was the
  // pick; John Kelly Jr. was an auction buy at the same price.
  '2018:1.05': { keep: 'Ronald Jones' },
  // Same collision: D'Andre Swift was the pick, Darrynton Evans was not.
  // (ESPN's keeper flag agrees here, and 2020 is the first year it does.)
  '2020:1.05': { keep: "D'Andre Swift" },
  // 1.03 was made and the owner dropped the player before the season, so he
  // never reached the keeper list. The slot is real; the name is gone.
  '2018:1.03': { dropped: true },
}

// Why a season can come back short. A recovered class only ever contains
// rookies who were still on a roster when the auction ran, so a pick whose
// player was cut before then leaves no trace at all — the pick was real and
// the record of it is gone. These are the commissioner's account of the
// gaps, not something the data can show.
const SEASON_NOTES = {
  2017: 'Full two rounds. The 6 missing picks are rookies dropped before the auction.',
}

// ── CSV ────────────────────────────────────────────────────────
const rows = (path) => {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.length > 0)
  const head = lines[0].split(',')
  const idx = Object.fromEntries(head.map((h, i) => [h, i]))
  return { idx, data: lines.slice(1).map((l) => l.split(',')) }
}

const nfl = rows(ROOKIES_CSV)
/** ESPN player id -> the NFL season that player was a rookie. */
const rookieSeason = new Map(
  nfl.data.map((r) => [r[nfl.idx.espn_id], Number(r[nfl.idx.rookie_season])]),
)

const hist = rows(HISTORY_CSV)
const g = (r, k) => r[hist.idx[k]]
const owners = JSON.parse(readFileSync(IDENTITY, 'utf8')).seasons

const draftRows = hist.data.filter((r) => g(r, 'RecordType') === 'DraftPick')

/**
 * The rookies a team KEPT into the auction, as opposed to bought in it.
 *
 * From 2020 ESPN sets its own Keeper flag and this is simply that flag.
 * Before 2020 it sets nothing, so position stands in for it: ESPN lists
 * every keeper before the first live auction bid, which puts the whole
 * keeper block at the front of the draft record. The rookie picks sit
 * inside that block; the dollar flyers sit far past it, which is why
 * Patrick Mahomes ($1, overall 188 of 228, 2017) reads as what he was —
 * an auction steal, not a second-round rookie pick.
 */
function keptRookies(season) {
  const all = draftRows
    .filter((r) => Number(g(r, 'Season')) === season)
    .sort((a, b) => Number(g(a, 'OverallPick')) - Number(g(b, 'OverallPick')))

  const isRookiePrice = (r) => [12, 10, 8, 6, 4, 2, 1].includes(Number(g(r, 'AuctionPrice')))
  const isRookie = (r) => rookieSeason.get(g(r, 'PlayerId')) === season

  // From 2020 ESPN flags the rookie picks as keepers, which is exactly the
  // question, so just ask it.
  if (all.some((r) => isRookie(r) && g(r, 'Keeper') === 'Y')) {
    return all.filter((r) => isRookie(r) && g(r, 'Keeper') === 'Y')
  }

  // Before 2020 it flags the returning keepers but not the rookies, because
  // the rookie picks were entered as draft selections rather than keepers.
  // They still sit in one identifiable run: ESPN writes the keeper block
  // first, the league entered its rookie class immediately after it, and the
  // live auction follows. So walk forward from the last keeper and take
  // qualifying rookies until the run dies out.
  //
  // The run is not solid — the first few auction nominations are interleaved
  // with it (Antonio Brown at $69 sits between two rookies in 2017) — so the
  // walk tolerates a gap. GAP is set well above the widest gap inside a real
  // run (10 rows, 2019) and well below the distance to the first late-auction
  // dollar flyer (85 rows to Terry McLaurin, same season). That gap is what
  // separates a second-round pick from a $1 steal, and both look identical
  // in every other column.
  const GAP = 20
  let cursor = 0
  all.forEach((r, i) => { if (g(r, 'Keeper') === 'Y') cursor = i })

  const out = []
  let since = 0
  for (let i = cursor + 1; i < all.length; i++) {
    if (isRookie(all[i]) && isRookiePrice(all[i])) { out.push(all[i]); since = 0; continue }
    if (++since > GAP) break
  }
  return out
}


// ── build a class ──────────────────────────────────────────────
function classFor(season) {
  const ladderEra = season <= LADDER_LAST_SEASON
  const picks = []
  const review = []

  for (const r of keptRookies(season)) {
    const price = Number(g(r, 'AuctionPrice'))
    const base = {
      name: g(r, 'Player'),
      overallPick: Number(g(r, 'OverallPick')),
      position: g(r, 'Position') || null,
      nflTeam: g(r, 'ProTeam') || null,
      team: owners[String(season)]?.[g(r, 'TeamId')] ?? null,
      price,
    }
    if (ladderEra && SLOT_PRICES[price]) picks.push({ ...base, slot: SLOT_PRICES[price], round: 1 })
    else if (price === 2) picks.push({ ...base, slot: null, round: 1 })
    else if (price === 1) picks.push({ ...base, slot: null, round: 2 })
    else review.push({ ...base, why: `$${price} is not a rookie contract price` })
  }

  // A slot can only be held once. Where two players share a ladder price,
  // the commissioner's ruling decides and the loser becomes an auction buy.
  for (const slot of Object.values(SLOT_PRICES)) {
    const claim = picks.filter((p) => p.slot === slot)
    if (claim.length < 2) continue
    const ruling = RULINGS[`${season}:${slot}`]
    if (ruling?.keep) {
      for (const p of claim) {
        if (p.name === ruling.keep) continue
        picks.splice(picks.indexOf(p), 1)
        review.push({ ...p, why: `ruled an auction buy — ${ruling.keep} held ${slot}` })
      }
    } else {
      for (const p of claim) p.contested = true
    }
  }

  // A slot the league used but the export can't name.
  for (const [key, ruling] of Object.entries(RULINGS)) {
    const [s, slot] = key.split(':')
    if (Number(s) !== season || !ruling.dropped) continue
    if (picks.some((p) => p.slot === slot)) continue
    picks.push({ name: null, position: null, nflTeam: null, team: null, price: null, slot, round: 1, dropped: true })
  }

  picks.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    if (a.slot && b.slot) return a.slot.localeCompare(b.slot)
    return a.slot ? -1 : b.slot ? 1 : (a.name ?? '').localeCompare(b.name ?? '')
  })
  return { season, picks, review }
}

// ── report ─────────────────────────────────────────────────────
const classes = []
for (let s = FIRST_SEASON; s <= 2025; s++) classes.push(classFor(s))

console.log('season | R1  R2  total | notes')
for (const c of classes) {
  const r1 = c.picks.filter((p) => p.round === 1).length
  const r2 = c.picks.filter((p) => p.round === 2).length
  const flags = []
  if (r1 + r2 > MAX_PICKS) flags.push(`${r1 + r2 - MAX_PICKS} OVER the ${MAX_PICKS} maximum`)
  if (r1 > 12) flags.push(`${r1 - 12} too many in round one`)
  if (r2 > 12) flags.push(`${r2 - 12} too many in round two`)
  if (c.picks.some((p) => p.contested)) flags.push('contested slot')
  const note = SEASON_NOTES[c.season]
  console.log(`${c.season}   | ${String(r1).padStart(2)}  ${String(r2).padStart(2)}   ${String(r1 + r2).padStart(3)}  | ${flags.join('; ') || (note ? 'accounted for' : 'clean')}`)
  if (note) console.log(`        ${note}`)
}

if (process.argv.includes('--verbose')) {
  for (const c of classes) {
    console.log(`\n── ${c.season} ${'─'.repeat(50)}`)
    for (const p of c.picks) {
      console.log(`  ${(p.slot ?? (p.round === 1 ? '1.xx' : '2.xx')).padEnd(5)} $${String(p.price ?? '?').padStart(2)}  ${(p.name ?? '(dropped before the season)').padEnd(24)} ${(p.position ?? '').padEnd(3)} ${p.team ?? '?'}${p.contested ? '   <-- CONTESTED' : ''}`)
    }
    for (const r of c.review) console.log(`   excluded: ${r.name} — ${r.why}`)
  }
}

if (process.argv.includes('--json')) {
  // Everything the review page needs, including where in the ESPN draft
  // record each player sat — that column is what makes a wrong call
  // recognisable to someone who was in the room.
  writeFileSync('/tmp/rookie-review.json', JSON.stringify(classes, null, 1))
  console.log('\nwrote /tmp/rookie-review.json')
}

if (process.argv.includes('--write')) {
  const strip = ({ overallPick, contested, ...rest }) => rest
  const body = classes.map((c) => `  ${c.season}: [\n${c.picks.map((p) => `    ${JSON.stringify(strip(p))},`).join('\n')}\n  ],`).join('\n')
  writeFileSync(OUT, `// Recovered rookie draft classes, ${FIRST_SEASON}-2025.
// Generated by web/scripts/extract-rookie-history.mjs — do not hand-edit;
// change the script (or its RULINGS table) and re-run with --write.
//
// slot is null where the price can't name one: $2 in the ladder era means
// somewhere in 1.06-1.12, and from 2022 every first-rounder cost $2.
export const rookieDraftHistory = {
${body}
}
`)
  console.log(`\nwrote ${OUT}`)
}
