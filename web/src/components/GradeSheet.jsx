// GradeSheet — every team's grades, pivot and score in one sortable grid.
//
// Extracted so the Dashboard's Power Rankings block and the POD's Rankings
// tab render the SAME table. Two copies would drift: a column added in one
// place, a sort fixed in the other, and eventually the two pages disagree
// about what a grade means.
//
// It renders whatever teams it is handed and gates nothing — the caller
// decides what is released. That keeps the release rule in one place
// (services/rankingsRelease.js) instead of smeared across two views.
import { useState } from 'react'
import { teamByEspnName, teamByName } from '../data/staticData'
import { gradeValue, pairValue } from '../services/gradeScale'

/** A → green, B → blue, C → amber, D/F → red. First character decides. */
function band(grade) {
  const c = String(grade ?? '').trim().charAt(0).toUpperCase()
  if (c === 'A') return 'a'
  if (c === 'B') return 'b'
  if (c === 'C') return 'c'
  if (c === 'D' || c === 'F') return 'd'
  return 'na'
}

/**
 * The Grade Sheet's columns, each declaring how it sorts.
 *
 * `get` returns the value to compare, so grades sort on the league scale
 * (gradeScale.js) rather than alphabetically — the difference between A+
 * leading the table and A+ sitting third.
 *
 * `dir` is the direction a FIRST click applies. Rank ascending puts the
 * champion on top; everything else descending puts the best value on top,
 * which is what you want from one click on QB. Text sorts A→Z.
 */
const COLUMNS = [
  { key: 'rank', label: '#', num: true, dir: 'asc', get: (t) => t.rank },
  { key: 'team', label: 'Team', dir: 'asc', get: (t) => t.team },
  { key: 'owner', label: 'Owner', dir: 'asc', get: (t) => ownerShort(t) },
  { key: 'QB', label: 'QB', num: true, dir: 'desc', get: (t) => gradeValue(t.grades?.QB) },
  { key: 'RB', label: 'RB', num: true, dir: 'desc', get: (t) => gradeValue(t.grades?.RB) },
  { key: 'WR', label: 'WR', num: true, dir: 'desc', get: (t) => gradeValue(t.grades?.WR) },
  { key: 'TE', label: 'TE', num: true, dir: 'desc', get: (t) => gradeValue(t.grades?.TE) },
  { key: 'bo', label: 'Bench / Owner', num: true, dir: 'desc',
    get: (t) => pairValue(t.grades?.DEPTH, t.grades?.OWNER) },
  { key: 'pivot', label: 'Pivot Player', dir: 'asc', get: (t) => t.pivot?.player },
  { key: 'overall', label: 'Verdict', num: true, dir: 'desc', get: (t) => gradeValue(t.overall) },
  { key: 'score', label: 'Score', num: true, dir: 'desc', get: (t) => t.score },
]

const ownerShort = (t) =>
  teamByName[teamByEspnName[String(t.team).toLowerCase()]]?.name ?? t.owner

/** Click the active column to flip it; click a new one to start on its own default. */
function nextSort(current, col) {
  return current.col === col.key
    ? { col: col.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { col: col.key, dir: col.dir }
}

function sortTeams(teams, sort) {
  const col = COLUMNS.find((c) => c.key === sort.col) ?? COLUMNS[0]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...teams].sort((a, b) => {
    const x = col.get(a)
    const y = col.get(b)
    // A missing value sinks to the bottom in BOTH directions — flipping the
    // sort should reorder the data, not float the gaps to the top.
    if (x == null && y == null) return a.rank - b.rank
    if (x == null) return 1
    if (y == null) return -1
    const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y
    // Rank is the tiebreak everywhere, so equal grades stay in ranking order
    // rather than shuffling between clicks.
    return cmp === 0 ? a.rank - b.rank : cmp * sign
  })
}

export default function GradeSheet({ teams }) {
  const [sort, setSort] = useState({ col: 'rank', dir: 'asc' })
  if (!teams?.length) return null
  return (
    <>
      <div className="tablewrap">
    <table className="gradesheet">
      <thead>
        <tr>
          {COLUMNS.map((c) => {
            const active = sort.col === c.key
            return (
              <th
                key={c.key}
                className={c.num ? 'num' : undefined}
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  className={`sortbtn${active ? ' active' : ''}`}
                  onClick={() => setSort(nextSort(sort, c))}
                  title={`Sort by ${c.label}`}
                >
                  {c.label}
                  <span className="arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                </button>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {sortTeams(teams, sort).map((t) => {
          const g = t.grades ?? {}
          const short = teamByName[teamByEspnName[String(t.team).toLowerCase()]]?.name
          // The same band colours the cards use — a grade means the
          // same thing here as it does on the card it came from.
          const cell = (v) => (
            <td className={`num v ${band(v)}`} title={v}>{String(v ?? '').split(' ')[0]}</td>
          )
          return (
            <tr key={t.rank}>
              <td className="num">{t.rank}</td>
              <td style={{ fontWeight: 600 }}>{t.team}</td>
              <td style={{ color: 'var(--mut)' }}>{short ?? t.owner}</td>
              {cell(g.QB)}{cell(g.RB)}{cell(g.WR)}{cell(g.TE)}
              <td className="num">
                <span className={`v ${band(g.DEPTH)}`}>{g.DEPTH}</span>
                <span style={{ color: 'var(--mut)' }}> / </span>
                <span className={`v ${band(g.OWNER)}`}>{g.OWNER}</span>
              </td>
              <td style={{ color: 'var(--mut)' }}>{t.pivot?.player}</td>
              <td className="num"><span className={`g ${band(t.overall)}`}>{t.overall}</span></td>
              <td className="num">{Number(t.score).toFixed(3)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
      </div>
      <div className="foot">Click any column to sort. Grades sort by the league scale, not alphabetically.</div>
    </>
  )
}
