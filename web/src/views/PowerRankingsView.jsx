// PowerRankingsView — the Taylor Made Power Rankings, at #power-rankings.
//
// Layout only. Every word comes from data/powerRankings2026.json, which is
// GENERATED upstream by power_rankings.py in the analytics agent and must
// never be hand-edited — a hand-edit is lost on the next run, and copy
// changes go back to Jared, not into this repo.
//
// Structure and values are ported from the generator's reference render
// rather than re-derived. Two rules from the handoff that are easy to lose
// and expensive to get wrong:
//
//   SORT ON `rank`, NEVER ON `score`. Two placements deliberately
//   contradict the weighted number — Dugan #2 over Faybik #3 on an
//   identical 3.110, and Cantone #5 above two teams that outscore him.
//   The score column genuinely reads out of order in two rows. Correct.
//
//   DO NOT NORMALISE WHITESPACE in the voice bodies. Corey Abad posts one
//   thought per line and that shape IS the joke. Blank line is a new
//   paragraph; a single newline is a <br>.
import { useEffect, useRef, useState } from 'react'
import { INITIAL_ROUTE } from '../services/routing'
import * as fs from '../services/firestoreService'
import {
  DROPS, dropStates, normalizeReleased, releasedTeams, isDropOut, isGradeSheetOut,
} from '../services/rankingsRelease'
import { edition as EDITION, editionId as EDITION_ID } from '../data/powerRankingsMeta'
import { teamByEspnName, teamByName } from '../data/staticData'
import { gradeValue, pairValue } from '../services/gradeScale'
import '../styles/powerRankings.css'

// THE CONTENT IS NEVER BUNDLED, and there is deliberately no import of it
// anywhere in this file — not even a dev-only one.
//
// A guarded `import.meta.env.DEV` import does get eliminated from the
// output, but Rollup still has to RESOLVE it, so the payload would have to
// stay committed to a public repo for the build to pass. The whole point
// of the per-drop Firestore layout is that an unreleased write-up exists
// in exactly two places: the analytics agent that generates it, and
// Firestore behind a membership rule. Adding a third copy to the repo to
// buy a local preview is a bad trade.
//
// The check that proves it: grep the built dist/ for a phrase from an
// unreleased card and expect zero hits.

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
 * Blank line → new paragraph, single newline → <br>. The one piece of
 * formatting logic on the page, and the one the handoff calls out twice.
 */
function Voice({ text, className }) {
  const paras = String(text ?? '').split(/\n\s*\n/)
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className={className}>
          {para.split('\n').map((line, j, all) => (
            <span key={j}>
              {line}
              {j < all.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  )
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

const SECTIONS = [
  { key: 'OVERVIEW', label: 'Overview', grade: null },
  { key: 'QB', label: 'Quarterback', grade: 'QB' },
  { key: 'RB', label: 'Running Back', grade: 'RB' },
  { key: 'WR', label: 'Receiver', grade: 'WR' },
  { key: 'TE', label: 'Tight End', grade: 'TE' },
  { key: 'BENCH_OWNER', label: 'Bench/Owner', grade: 'BENCH_OWNER' },
]

const MINIS = [
  ['QB', 'QB'], ['RB', 'RB'], ['WR', 'WR'],
  ['TE', 'TE'], ['DEPTH', 'Bench'], ['OWNER', 'Owner'],
]

function TeamCard({ team, open, onToggle }) {
  const g = team.grades ?? {}
  return (
    <details className="team" open={open} onToggle={(e) => onToggle(team.slug, e.currentTarget.open)}>
      <summary>
        <span className="rank">{team.rank}</span>
        <span className="who">
          <span className="tn">{team.team}</span>
          <span className="ow">{team.owner}</span>
        </span>
        <span className="ovr">
          <span className={`g ${band(team.overall)}`}>{team.overall}</span>
          <span className="lb">Overall</span>
        </span>
        {/* The six grades live HERE and only here. The summary stays visible
            when a card opens, so repeating them in the body is noise. */}
        <div className="minis">
          {MINIS.map(([key, label]) => (
            <span className="mini" key={key}>
              <span className="k">{label}</span>
              <span className={`v ${band(g[key])}`}>{g[key]}</span>
            </span>
          ))}
        </div>
      </summary>

      <div className="body">
        <div className="score mono">Weighted score {Number(team.score).toFixed(3)}</div>

        <div className="pills" aria-label="Top rostered players">
          {(team.top ?? []).map((p, i) => (
            <span className={`pill ${String(p.pos).toLowerCase()}`} key={`${p.name}-${i}`}>
              <span className="pp-pos">{p.pos}</span>
              {p.name}
              {p.rank != null && <span className="pr">{p.rank}</span>}
            </span>
          ))}
        </div>

        {SECTIONS.map((s) => {
          const bodyText = team.sections?.[s.key]
          if (!bodyText) return null
          return (
            <div className="sec" key={s.key}>
              <div className="sechead">
                <span className="lab">{s.label}</span>
                {/* Bench/Owner is one chip carrying both grades, slash in
                    --mut, no B/O/D prefix letters. */}
                {s.grade === 'BENCH_OWNER' ? (
                  <span className="gg">
                    <span className={`v ${band(g.DEPTH)}`}>{g.DEPTH}</span>
                    <span className="sl">/</span>
                    <span className={`v ${band(g.OWNER)}`}>{g.OWNER}</span>
                  </span>
                ) : s.grade ? (
                  <span className={`gg v ${band(g[s.grade])}`}>{g[s.grade]}</span>
                ) : null}
              </div>
              <Voice text={bodyText} />
            </div>
          )
        })}

        {team.pivot && (
          <div className="pp">
            <div className="h">Pivot Player</div>
            <div className="n">{team.pivot.player}</div>
            <Voice text={team.pivot.text} />
          </div>
        )}

        <div className="verdict">
          <span className={`g ${band(team.overall)}`}>{team.overall}</span>
          <div className="t">
            <div className="h">Final Verdict</div>
            <Voice text={team.verdict} />
          </div>
        </div>
      </div>
    </details>
  )
}

/**
 * `embedded` = rendered inline in the Dashboard's main column rather than
 * as its own page. Two differences, both about not swallowing the page it
 * is sitting in: the 760px reading wrapper comes off (the column already
 * constrains it), and every section starts COLLAPSED. Expanded by default
 * inline would push the entire rest of the Dashboard below eight thousand
 * words. The standalone page at #power-rankings still opens its sections,
 * because there it is the only thing on screen.
 */
export default function PowerRankingsView({ embedded = false }) {
  const [meta, setMeta] = useState(null)
  const [bodies, setBodies] = useState({})   // drop key → its fetched doc
  const [loading, setLoading] = useState(true)

  // The meta doc is a listener and carries no content — just the released
  // list — so opening a drop reaches everyone in seconds without a reload.
  useEffect(
    () => fs.listenToPowerRankingsMeta(EDITION_ID, (m) => { setMeta(m); setLoading(false) }),
    [],
  )

  const released = normalizeReleased(meta?.released)
  const key = released.join(',')

  // Fetch only what is released, and only once per drop.
  useEffect(() => {
    let alive = true
    for (const k of released) {
      if (bodies[k]) continue
      fs.fetchPowerRankingsDrop(EDITION_ID, k)
        .then((d) => { if (alive && d) setBodies((prev) => ({ ...prev, [k]: d })) })
        .catch(() => {})
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const drops = dropStates(released)
  const teams = releasedTeams(released, bodies)
  const intro = isDropOut(released, 'intro') ? bodies.intro : null
  const data = { edition: meta?.edition ?? EDITION, date: meta?.date ?? '' }
  const [sort, setSort] = useState({ col: 'rank', dir: 'asc' })

  // A deep link opens exactly one card. Read once on mount — after that the
  // reader is in charge of what's open.
  // From the boot-time snapshot, NOT from window.location.hash: this view
  // is lazy, so by the time it mounts TabLayout has already rewritten the
  // hash to the bare slug and the team segment is gone. See INITIAL_ROUTE.
  const [openSlug, setOpenSlug] = useState(() => {
    if (INITIAL_ROUTE.slug !== 'power-rankings') return null
    const p = INITIAL_ROUTE.params
    return p.length ? p[p.length - 1] : null
  })
  const deepRef = useRef(null)
  useEffect(() => {
    if (openSlug && deepRef.current) {
      deepRef.current.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jump = (key) => {
    document.getElementById(`drop-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="pr-page">
      <div className={embedded ? 'pr-embed' : 'pr-wrap'}>
        <header className="mast">
          <div className="eyebrow">Insanity League · {data.edition}</div>
          <h1 style={embedded ? { fontSize: 'clamp(24px,4.5vw,32px)', margin: '4px 0 8px' } : undefined}>
            The Taylor Made Power Rankings
          </h1>
          <p className="sub">Judged against one standard: IFFL CHAMPION.</p>
          <p className="sub">Every owner delivers Jared's verdict on their own team. In their own words.</p>
          <p className="sub mono" style={{ marginTop: 6 }}>{data.date}</p>
          <ul className="meter">
            {drops.map((d) => (
              <li key={d.key}>
                <button type="button" onClick={() => jump(d.key)}>
                  <span className={d.out ? 'dot' : 'dot off'} />
                  {d.label.replace('Ranks ', '')}
                </button>
              </li>
            ))}
          </ul>
        </header>

        {loading && <p className="sub" style={{ marginTop: 28 }}>Loading…</p>}


        {intro && (
        <section>
          <details open={!embedded}>
            <summary><span className="cond">The Taylor Made™️ Lookback</span></summary>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">™️</th>
                    <th>Owner</th>
                    <th>Team</th>
                    <th className="num">Final</th>
                    <th className="num">Miss</th>
                  </tr>
                </thead>
                <tbody>
                  {(intro.lookback?.rows ?? []).map((r) => (
                    <tr key={r.owner}>
                      <td className="num">{r.tm}</td>
                      <td>{r.owner}</td>
                      <td>
                        {r.team}
                        {r.badge && (
                          <span className={`badge ${r.badge === 'CHAMP' ? 'champ' : 'last'}`}>{r.badge}</span>
                        )}
                      </td>
                      <td className="num">{r.final}</td>
                      <td className="num">
                        <span className={`miss ${r.dir === '▲' ? 'up' : r.dir === '▼' ? 'dn' : ''}`}>
                          {r.miss === 'exact' ? 'exact' : `${r.miss} ${r.dir}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="foot">{intro.lookback?.summary}</div>
          </details>
        </section>
        )}

        {intro && (
        <section>
          <details open={!embedded}>
            <summary><span className="cond">The State of the League</span></summary>
            <div style={{ padding: '14px 16px' }}>
              <div className="prose">
                {(intro.intro ?? []).map((p, i) => <Voice text={p} key={i} />)}
              </div>
            </div>
          </details>
        </section>
        )}

        {intro && (
        <section>
          <details>
            <summary><span className="cond">A Note From The Machine</span></summary>
            <div style={{ padding: '14px 16px' }}>
              <div className="prose machine">
                {(intro.foreword ?? []).map((p, i) => <Voice text={p} key={i} />)}
                <p className="sig">— Claude</p>
              </div>
            </div>
          </details>
        </section>
        )}

        {!loading && !intro && (
          <section>
            <div className="drop locked" style={{ border: '1px dashed var(--line)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                <span className="dh cond">Introduction</span>
                <span className="lockchip">Locked</span>
              </div>
            </div>
          </section>
        )}

        <section>
          {drops.filter((d) => d.from).map((d) => {
            if (!d.out) {
              // NO BODY IN THE DOM. An unreleased drop must never reach the
              // client — not hidden, not collapsed, absent.
              return (
                <div className="drop locked" id={`drop-${d.key}`} key={d.key}
                     style={{ border: '1px dashed var(--line)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                    <span className="dh cond">{d.label}</span>
                    <span className="lockchip">Locked</span>
                  </div>
                </div>
              )
            }
            const mine = teams.filter((t) => t.rank <= d.from && t.rank >= d.to)
            return (
              <details className="drop" id={`drop-${d.key}`} key={d.key} open={!embedded}>
                <summary>
                  <span className="dh cond">{d.label}</span>
                  <span className="count mono">{mine.length} teams</span>
                </summary>
                <div className="dropbody">
                  {mine.map((t) => (
                    <div key={t.slug} ref={t.slug === openSlug ? deepRef : null}>
                      <TeamCard
                        team={t}
                        open={t.slug === openSlug}
                        onToggle={(slug, isOpen) => { if (!isOpen && slug === openSlug) setOpenSlug(null) }}
                      />
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </section>

        {/* The Grade Sheet, at the bottom where the Ladder used to be.
            It REPLACED the ladder rather than joining it: same twelve rows,
            strictly more information, and two tables of the same teams is
            one table too many.

            Still gated to the LAST drop by isGradeSheetOut — every grade,
            pivot and score in one grid is the whole document at a glance,
            so it cannot appear while anything is held back. Derived from
            the payload, never hardcoded. */}
        {isGradeSheetOut(released) && teams.length > 0 && (
        <section>
          <details open={!embedded}>
            <summary><span className="cond">The Grade Sheet</span></summary>
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
          </details>
        </section>
        )}
      </div>
    </div>
  )
}
