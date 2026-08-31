// HistoryView — the league's records, as a page rather than a pop-up.
//
// Six categories, one screen. The page itself knows nothing about auctions
// or trades: every tab is driven by a declaration in
// services/historyCategories.js, and the search, filters, sort and export
// all come from services/historyTable.js. That's what keeps six tabs from
// being six screens, and it's why a seventh is one object and no new UI.
//
// Loading is staged by each category's `cost`, because the categories are
// wildly different sizes. Rookie drafts and trades ship with the app.
// Auctions and games are fetched the first time their tab is opened and
// then cached for the session. Player scores are fetched one season at a
// time — the weekly lines are 32,000 rows and no amount of clever
// rendering makes downloading all of them onto a phone a good idea.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { ChipScroller, LoadingList } from '../components/shared'
import TeamLink from '../components/TeamLink'
import * as fs from '../services/firestoreService'
import { CATEGORIES, categoryBySlug, slugOf } from '../services/historyCategories'
import {
  indexRows, queryRows, optionsFor, toCSV, exportFilename, downloadCSV,
} from '../services/historyTable'
import { rookieDraftHistory } from '../data/rookieDraftHistory'
import { rookieClass2026 } from '../data/rookieDraft2026'
import { tradesHistory } from '../data/tradesHistory'
import { trades2026 } from '../data/trades2026'
import { auctionHistory } from '../data/auctionHistory'
import { gamesHistory } from '../data/gamesHistory'
import { TEAM_NAMES } from '../services/historyCategories'

/** How many rows the table renders at once. Export is never truncated. */
const PAGE = 200

const ROOKIE_SOURCE = { ...rookieDraftHistory, 2026: rookieClass2026 }

/** Trades that ship with the app: 2022-24 from the workbook, plus 2026. */
const BUNDLED_TRADES = [
  ...Object.entries(tradesHistory).flatMap(([season, list]) =>
    list.map((t) => ({ ...t, season: Number(season) }))),
  ...trades2026.map((t) => ({ ...t, season: 2026 })),
]

export default function HistoryView() {
  const { leagueHistory, loadLeagueHistory, userTeam } = useApp()
  const isDesktop = useIsDesktop()

  // Which tab, from the URL: #history/player-scores
  const [category, setCategory] = useState(() => {
    const seg = (window.location.hash.split('/')[1] ?? '').split('?')[0]
    return categoryBySlug(seg) ?? CATEGORIES[0]
  })

  const [text, setText] = useState('')
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  // Player Scores is season-scoped, so the season lives outside `filters`:
  // it decides what gets FETCHED, not what gets filtered afterwards.
  const [season, setSeason] = useState(null)
  const [grain, setGrain] = useState('season')   // 'season' totals | 'weekly' lines
  // Some tabs hold the same data at two zoom levels — Standings by season
  // vs all-time. `alt` is that second view; it changes the columns, not
  // what gets fetched.
  const [useAlt, setUseAlt] = useState(false)
  const [loading, setLoading] = useState(false)

  // Fetched sources, cached for the session so switching tabs is free
  // after the first visit.
  const cache = useRef({})
  const [, forceRender] = useState(0)

  useEffect(() => { loadLeagueHistory() }, [loadLeagueHistory])

  // On a phone the chip row scrolls, so a tab arrived at by URL can start
  // off-screen — the page would look like it opened on Auction. Bring the
  // active chip into view instead.
  const chipRow = useRef(null)
  useEffect(() => {
    const el = chipRow.current?.querySelector('[aria-pressed="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [category.key])

  // Keep the URL on the current tab so a tab is a shareable link.
  //
  // replaceState rather than assigning location.hash: switching tabs is not
  // a navigation anyone wants to press Back through six times, and it also
  // means these writes fire no hashchange, so the reader below can't loop
  // against this.
  useEffect(() => {
    const want = `#history/${slugOf(category)}`
    if (window.location.hash !== want) window.history.replaceState(null, '', want)
  }, [category])

  // ...and read it back, because the URL changes without this component
  // remounting: following a link to #history/games while already on
  // #history/auction is a hash change, not a reload, so without this the
  // page would keep showing the tab it happened to open on.
  useEffect(() => {
    const onHash = () => {
      const seg = (window.location.hash.split('/')[1] ?? '').split('?')[0]
      const next = categoryBySlug(seg)
      if (next && next.key !== category.key) setCategory(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [category.key])

  // Reset the query when the tab changes — a price range from the auction
  // tab means nothing on Games, and leaving it applied would silently
  // empty the new tab.
  useEffect(() => {
    setText(''); setFilters({}); setSort(null); setLimit(PAGE); setUseAlt(false)
  }, [category.key])

  // The active shape: a tab's alt view swaps both the columns and the
  // mapper, so everything downstream keeps working off one pair.
  const view = useAlt && category.alt ? category.alt : category
  const columns = view.columns

  const seasonsAvailable = useMemo(() => {
    const ys = leagueHistory.map((s) => Number(s.season)).filter(Number.isFinite)
    return ys.length ? ys.sort((a, b) => b - a) : []
  }, [leagueHistory])

  useEffect(() => {
    if (category.cost === 'season' && season == null && seasonsAvailable.length) {
      setSeason(seasonsAvailable[0])
    }
  }, [category.cost, season, seasonsAvailable])

  // ── loading ───────────────────────────────────────────────
  const cacheKey = category.cost === 'season' ? `${category.key}:${grain}:${season}` : category.key

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (category.cost === 'bundled') return
      if (cache.current[cacheKey]) return
      if (category.cost === 'season' && season == null) return
      setLoading(true)
      let docs = []
      try {
        if (category.key === 'playerScores') {
          docs = grain === 'weekly'
            ? await fs.fetchHistoryPlayerWeeks(season)
            : (await fs.fetchHistoryPlayerSeasons()).filter((d) => Number(d.season) === Number(season))
        }
      } finally {
        if (!cancelled) {
          cache.current[cacheKey] = docs
          setLoading(false)
          forceRender((n) => n + 1)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [category.key, category.cost, cacheKey, grain, season])

  // ── rows ──────────────────────────────────────────────────
  const rows = useMemo(() => {
    let source
    if (category.key === 'rookieDrafts') source = ROOKIE_SOURCE
    else if (category.key === 'standings') source = leagueHistory
    else if (category.key === 'trades') source = BUNDLED_TRADES
    else if (category.key === 'auction') source = auctionHistory
    else if (category.key === 'games') source = gamesHistory
    else source = cache.current[cacheKey] ?? []
    return indexRows(view.toRows(source), columns)
  }, [category, view, columns, cacheKey, leagueHistory, loading])

  const result = useMemo(
    () => queryRows(rows, columns, { text, filters, sort }),
    [rows, columns, text, filters, sort],
  )

  const visible = result.slice(0, limit)
  const filterCols = columns.filter((c) => c.filter)
  const active = Object.entries(filters).some(([, v]) =>
    v && (typeof v === 'object' ? v.min !== '' || v.max !== '' : v !== ''))

  const clearAll = () => { setText(''); setFilters({}); setSort(null); setLimit(PAGE) }

  const setFilter = (key, value) =>
    setFilters((f) => ({ ...f, [key]: value }))

  const toggleSort = (key) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  function exportRows(scope) {
    const data = scope === 'all' ? rows : result
    downloadCSV(
      exportFilename(category.key, { text: scope === 'all' ? '' : text, filters: scope === 'all' ? {} : filters, scope }),
      toCSV(data, columns),
    )
  }

  // ── chrome ────────────────────────────────────────────────
  const tabs = (
    <ChipScroller>
      <div ref={chipRow} style={{ display: 'flex', gap: 6, width: 'max-content', paddingBottom: 2 }}>
        {CATEGORIES.map((c) => {
          const on = c.key === category.key
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c)}
              aria-pressed={on}
              style={{
                padding: '7px 15px', borderRadius: 18, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: on ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                color: on ? '#fff' : 'var(--iff-subtext)',
              }}
            >
              <span style={{ marginRight: 6 }}>{c.glyph}</span>{c.label}
            </button>
          )
        })}
      </div>
    </ChipScroller>
  )

  const filterBar = (
    <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="search"
        value={text}
        onChange={(e) => { setText(e.target.value); setLimit(PAGE) }}
        placeholder={`Search ${category.label.toLowerCase()}…`}
        aria-label={`Search ${category.label}`}
        style={{ fontSize: 15, padding: '11px 13px' }}
      />

      {category.alt && (
        <div style={{ display: 'flex', gap: 6 }}>
          {[[false, `By season`], [true, category.alt.label]].map(([v, label]) => (
            <button key={String(v)} onClick={() => { setUseAlt(v); setSort(null); setFilters({}) }} aria-pressed={useAlt === v}
              style={{
                padding: '6px 14px', borderRadius: 16, fontSize: 11.5, fontWeight: 700,
                background: useAlt === v ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                color: useAlt === v ? '#fff' : 'var(--iff-subtext)',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Season and grain for the season-scoped tab decide what is FETCHED,
          so they sit apart from the filters that narrow what came back. */}
      {category.cost === 'season' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: 'var(--iff-subtext)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Season
            <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))}
              style={{ width: 'auto', fontSize: 12, padding: '7px 9px' }}>
              {seasonsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['season', 'Season totals'], ['weekly', 'Weekly lines']].map(([k, label]) => (
              <button key={k} onClick={() => setGrain(k)} aria-pressed={grain === k}
                style={{
                  padding: '6px 13px', borderRadius: 16, fontSize: 11.5, fontWeight: 700,
                  background: grain === k ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: grain === k ? '#fff' : 'var(--iff-subtext)',
                }}>
                {label}
              </button>
            ))}
          </div>
          {grain === 'weekly' && season != null && season < 2018 && (
            <span style={{ fontSize: 11, color: 'var(--iff-gold)' }}>
              ESPN kept no weekly player data before 2018.
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterCols.map((c) => c.filter === 'range' ? (
          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--iff-subtext)' }}>
            {c.label}
            <input type="number" inputMode="numeric" placeholder="min" aria-label={`${c.label} minimum`}
              value={filters[c.key]?.min ?? ''}
              onChange={(e) => setFilter(c.key, { ...(filters[c.key] ?? { max: '' }), min: e.target.value })}
              style={{ width: 66, fontSize: 12, padding: '6px 8px' }} />
            <input type="number" inputMode="numeric" placeholder="max" aria-label={`${c.label} maximum`}
              value={filters[c.key]?.max ?? ''}
              onChange={(e) => setFilter(c.key, { ...(filters[c.key] ?? { min: '' }), max: e.target.value })}
              style={{ width: 66, fontSize: 12, padding: '6px 8px' }} />
          </span>
        ) : (
          <select key={c.key} value={filters[c.key] ?? ''} aria-label={`Filter by ${c.label}`}
            onChange={(e) => { setFilter(c.key, e.target.value); setLimit(PAGE) }}
            style={{ width: 'auto', fontSize: 12, padding: '7px 9px' }}>
            <option value="">{c.allLabel ?? `Any ${c.label.toLowerCase()}`}</option>
            {optionsFor(rows, c).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        {(active || text || sort) && (
          <button onClick={clearAll} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--iff-subtext)', padding: '6px 10px' }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )

  const countLine = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: 'var(--iff-subtext)' }}>
        <strong className="tnum" style={{ color: 'var(--iff-text)' }}>{result.length.toLocaleString()}</strong>
        {result.length === 1 ? ' row' : ' rows'}
        {result.length !== rows.length && <span className="tnum"> of {rows.length.toLocaleString()}</span>}
      </span>
      <span style={{ flex: 1 }} />
      <button onClick={() => exportRows('results')} disabled={result.length === 0}
        style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: 'var(--iff-elevated)', color: 'var(--iff-text)', opacity: result.length ? 1 : 0.45 }}>
        ⭳ Export results
      </button>
      <button onClick={() => exportRows('all')} disabled={rows.length === 0}
        style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: 'var(--iff-elevated)', color: 'var(--iff-subtext)', opacity: rows.length ? 1 : 0.45 }}>
        ⭳ Export all {category.label.toLowerCase()}
      </button>
    </div>
  )

  const table = (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Wide tables scroll inside their own box so the page never
          scrolls sideways on a phone. */}
      <div style={{ overflowX: 'auto' }}>
        <table className="hist-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ textAlign: c.align === 'right' ? 'right' : 'left', width: c.width, cursor: 'pointer' }}
                >
                  {c.label}
                  {sort?.key === c.key && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i} style={{ background: r.team === userTeam || r.to === userTeam ? 'rgba(255,255,255,0.03)' : undefined }}>
                {columns.map((c) => {
                  const raw = r[c.key]
                  const val = c.format ? c.format(raw, r) : raw
                  const isTeam = ['team', 'owner', 'to', 'from', 'opponent'].includes(c.key)
                  return (
                    <td key={c.key} className={c.type === 'number' || c.type === 'season' ? 'tnum' : undefined}
                      style={{ textAlign: c.align === 'right' ? 'right' : 'left' }}>
                      {isTeam && raw && TEAM_NAMES.includes(raw) ? <TeamLink name={raw} /> : (val ?? '')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.length > visible.length && (
        <button onClick={() => setLimit((n) => n + PAGE)}
          style={{ width: '100%', padding: '11px 0', fontSize: 12, fontWeight: 700, color: 'var(--iff-accent)', borderTop: '1px solid var(--iff-divider)' }}>
          Show {Math.min(PAGE, result.length - visible.length)} more
          <span className="tnum" style={{ color: 'var(--iff-subtext)', fontWeight: 500 }}> · {(result.length - visible.length).toLocaleString()} left</span>
        </button>
      )}
    </div>
  )

  const empty = (
    <div className="iff-card empty-state" style={{ padding: 28 }}>
      <div className="glyph">{category.glyph}</div>
      <div className="title">{rows.length === 0 ? `No ${category.label.toLowerCase()} loaded` : 'Nothing matches'}</div>
      <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6, marginTop: 4, maxWidth: 460 }}>
        {rows.length === 0
          ? `${category.blurb} Nothing has been seeded for this category yet.`
          : 'Try a surname on its own, or clear a filter.'}
      </div>
      {rows.length > 0 && (
        <button onClick={clearAll} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'var(--iff-elevated)', color: 'var(--iff-text)' }}>
          Clear filters
        </button>
      )}
    </div>
  )

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tabs}
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>{category.blurb}</div>
      {filterBar}
      {loading ? <LoadingList count={8} /> : (
        <>
          {countLine}
          {visible.length === 0 ? empty : table}
        </>
      )}
    </div>
  )

  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>League History</h1>
          <span className="season-chip tnum">{rows.length.toLocaleString()} rows</span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">League History</div>
        <div className="nav-side right" />
      </div>
      <div style={{ padding: '0 14px 16px' }}>{body}</div>
    </div>
  )
}
