// PlayersView — league-wide player browser with full search + filters.
// Every asset in the league in one place: search by name/NFL team, filter by
// position, fantasy team, contract years, and price range; sort any column.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { fantasyTeams } from '../data/staticData'
import { PosBadge, LoadingList, TeamAvatar, ChipScroller } from '../components/shared'
import AssetDetailView from '../components/AssetDetailView'
import SettingsView from './SettingsView'

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'Picks']
const CONTRACTS = [
  { key: 'any', label: 'Any yrs' },
  { key: '1',   label: '1 yr' },
  { key: '2',   label: '2 yrs' },
  { key: '3+',  label: '3+ yrs' },
]

export default function PlayersView({ setTab }) {
  const {
    allDisplayAssets, droppedPlayers, isInitialLoadComplete, activeSeason, userTeam,
    interestedAssetIds, toggleInterest, proposeTradeFor,
  } = useApp()
  const isDesktop = useIsDesktop()

  const [search, setSearch] = useState('')
  const [pos, setPos] = useState('All')
  const [team, setTeam] = useState('All')
  const [contract, setContract] = useState('any')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [freeAgentOnly, setFreeAgentOnly] = useState(false)
  const [sort, setSort] = useState({ key: 'p0', desc: true })
  const [detailAsset, setDetailAsset] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const seasons = [activeSeason, activeSeason + 1, activeSeason + 2]

  const rows = useMemo(() => {
    let list = allDisplayAssets

    if (pos === 'Picks') list = list.filter((a) => a.isPick)
    else if (pos !== 'All') list = list.filter((a) => a.position === pos)

    if (team !== 'All') list = list.filter((a) => a.teamName === team)

    if (contract !== 'any') {
      list = list.filter((a) => {
        const y = a.contractYearsRemaining ?? 0
        if (contract === '3+') return y >= 3
        return String(y) === contract
      })
    }

    if (freeAgentOnly) list = list.filter((a) => a.playerPool === 'Free Agent')

    const min = minPrice === '' ? null : Number(minPrice)
    const max = maxPrice === '' ? null : Number(maxPrice)
    if (min != null) list = list.filter((a) => a.currentPrice >= min)
    if (max != null) list = list.filter((a) => a.currentPrice <= max)

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.teamName.toLowerCase().includes(q) ||
          (a.nflTeam ?? '').toLowerCase().includes(q) ||
          a.position.toLowerCase().includes(q),
      )
    }

    const dir = sort.desc ? -1 : 1
    const val = (a) => {
      if (sort.key === 'name') return a.name.toLowerCase()
      if (sort.key === 'pos') return a.position
      if (sort.key === 'team') return a.teamName
      if (sort.key === 'yrs') return a.contractYearsRemaining ?? 0
      const yr = seasons[Number(sort.key[1])]
      return a.prices?.[String(yr)] ?? 0
    }
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0))
  }, [allDisplayAssets, pos, team, contract, freeAgentOnly, minPrice, maxPrice, search, sort, seasons])

  const activeFilters =
    (pos !== 'All' ? 1 : 0) + (team !== 'All' ? 1 : 0) + (contract !== 'any' ? 1 : 0) +
    (freeAgentOnly ? 1 : 0) + (minPrice !== '' ? 1 : 0) + (maxPrice !== '' ? 1 : 0)

  function resetFilters() {
    setPos('All'); setTeam('All'); setContract('any')
    setMinPrice(''); setMaxPrice(''); setFreeAgentOnly(false); setSearch('')
  }

  function clickSort(key, ascFirst = false) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !ascFirst }))
  }
  const arrow = (key) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')

  function handleProposeTrade(asset) {
    setDetailAsset(null)
    proposeTradeFor(asset)
    setTab(3) // Market
  }

  // ── Filter controls (shared) ────────────────────────────────
  const filters = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="search"
        placeholder="Search player, position, fantasy team, or NFL team…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <ChipScroller>
        <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              style={{
                padding: '5px 13px', borderRadius: 18, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: pos === p ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                color: pos === p ? '#fff' : 'var(--iff-subtext)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </ChipScroller>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: 'auto', minWidth: 118, fontSize: 12, padding: '7px 9px' }}>
          <option value="All">All teams</option>
          {fantasyTeams.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>

        <select value={contract} onChange={(e) => setContract(e.target.value)} style={{ width: 'auto', minWidth: 92, fontSize: 12, padding: '7px 9px' }}>
          {CONTRACTS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input
            type="number" min="0" placeholder="$ min" value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="tnum" style={{ width: 72, fontSize: 12, padding: '7px 8px', textAlign: 'center' }}
          />
          <span style={{ color: 'var(--iff-subtext)', fontSize: 12 }}>–</span>
          <input
            type="number" min="0" placeholder="$ max" value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="tnum" style={{ width: 72, fontSize: 12, padding: '7px 8px', textAlign: 'center' }}
          />
        </span>

        <button
          onClick={() => setFreeAgentOnly((v) => !v)}
          style={{
            padding: '6px 13px', borderRadius: 18, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
            background: freeAgentOnly ? 'var(--iff-gold)' : 'var(--iff-elevated)',
            color: freeAgentOnly ? '#241A05' : 'var(--iff-subtext)',
          }}
        >
          Free agents
        </button>

        {activeFilters > 0 && (
          <button onClick={resetFilters} style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)', whiteSpace: 'nowrap' }}>
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'} ✕
          </button>
        )}
      </div>
    </div>
  )

  // Dropped-player panel — visible league-wide once the season churns.
  // Shows the 2-auction clock so everyone can see whose salary is still live.
  const droppedPanel = droppedPlayers.length > 0 && (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16, borderLeft: '3px solid #EF4444' }}>
      <div style={{ padding: '11px 14px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
        🕐 Dropped Players — salary clock
      </div>
      {droppedPlayers.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <PosBadge position={p.position} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)' }}>
              {p.salaryStatus === 'cleared'
                ? 'cleared — reset to $2, cap-exempt'
                : `dropped by ${p.teamName} · $${p.currentPrice} follows if claimed`}
            </span>
          </span>
          <span className="tnum" style={{ fontSize: 11.5, fontWeight: 800, color: p.salaryStatus === 'cleared' ? 'var(--iff-subtext)' : 'var(--iff-gold)' }}>
            {p.salaryStatus === 'cleared' ? '✓ clear' : `${p.auctionsCleared}/2 auctions`}
          </span>
        </div>
      ))}
    </div>
  )

  const overlays = (
    <>
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {detailAsset && (
        <AssetDetailView
          asset={detailAsset}
          onBack={() => setDetailAsset(null)}
          onProposeTrade={handleProposeTrade}
          desktop="panel"
        />
      )}
    </>
  )

  // ── Desktop: filter bar + full sortable table ───────────────
  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>Players</h1>
          <span className="season-chip tnum">{rows.length} of {allDisplayAssets.length} assets</span>
        </div>

        <div className="iff-card" style={{ padding: 14, marginBottom: 16 }}>{filters}</div>
        {droppedPanel}

        {!isInitialLoadComplete ? (
          <LoadingList count={8} />
        ) : rows.length === 0 ? (
          <div className="iff-card empty-state">
            <div className="glyph">🔍</div>
            <div className="title">No players match</div>
            <div>Try widening your filters.</div>
          </div>
        ) : (
          <div className="iff-card" style={{ overflowX: 'auto' }}>
            <table className="alltime-table players-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}><button onClick={() => clickSort('pos', true)}>Pos{arrow('pos')}</button></th>
                  <th style={{ textAlign: 'left' }}><button onClick={() => clickSort('name', true)}>Player{arrow('name')}</button></th>
                  <th style={{ textAlign: 'left' }}><button onClick={() => clickSort('team', true)}>Team{arrow('team')}</button></th>
                  <th style={{ textAlign: 'left' }}>NFL</th>
                  <th style={{ textAlign: 'right' }}><button onClick={() => clickSort('yrs', true)}>Yrs{arrow('yrs')}</button></th>
                  {seasons.map((yr, i) => (
                    <th key={yr} style={{ textAlign: 'right' }}>
                      <button onClick={() => clickSort(`p${i}`)}>'{String(yr).slice(2)}{arrow(`p${i}`)}</button>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>★</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const starred = interestedAssetIds.has(a.assetId)
                  return (
                    <tr key={a.id} onClick={() => setDetailAsset(a)} style={{ cursor: 'pointer' }}>
                      <td><PosBadge position={a.position} /></td>
                      <td style={{ fontWeight: 600, whiteSpace: 'normal', minWidth: 150 }}>{a.name}</td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <TeamAvatar name={a.teamName} size={20} />
                          <span style={{ fontSize: 12 }}>{a.teamName}</span>
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{a.nflTeam ?? '—'}</td>
                      <td className="tnum" style={{ textAlign: 'right', color: 'var(--iff-subtext)' }}>
                        {a.isPick ? '—' : a.contractYearsRemaining}
                      </td>
                      {seasons.map((yr, i) => (
                        <td key={yr} className="tnum" style={{ textAlign: 'right', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--iff-green)' : 'var(--iff-subtext)' }}>
                          ${a.prices?.[String(yr)] ?? 0}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center' }}>
                        {a.teamName !== userTeam ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleInterest(a) }}
                            aria-label={starred ? `Remove interest in ${a.name}` : `Mark interest in ${a.name}`}
                            style={{ fontSize: 15, color: starred ? 'var(--iff-gold)' : 'var(--iff-subtext)' }}
                          >
                            {starred ? '★' : '☆'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>mine</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {overlays}
      </div>
    )
  }

  // ── Mobile: filter panel + compact rows ─────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">Players</div>
        <div className="nav-side right">
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </div>

      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--iff-divider)' }}>{filters}</div>

      {droppedPanel && <div style={{ padding: '12px 14px 0' }}>{droppedPanel}</div>}

      <div style={{ padding: '8px 14px 0', fontSize: 10.5, color: 'var(--iff-subtext)' }}>
        <span className="tnum">{rows.length}</span> of <span className="tnum">{allDisplayAssets.length}</span> assets
        {' · '}
        <button onClick={() => clickSort('p0')} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--iff-gold)' }}>
          price {sort.key === 'p0' && !sort.desc ? '↑' : '↓'}
        </button>
        {' · '}
        <button onClick={() => clickSort('name', true)} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--iff-gold)' }}>
          name {sort.key === 'name' && sort.desc ? '↓' : '↑'}
        </button>
      </div>

      {!isInitialLoadComplete ? (
        <LoadingList />
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">🔍</div>
          <div className="title">No players match</div>
          <div>Try widening your filters.</div>
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {rows.map((a) => {
            const starred = interestedAssetIds.has(a.assetId)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
                <button onClick={() => setDetailAsset(a)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <PosBadge position={a.position} />
                  <TeamAvatar name={a.teamName} size={26} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', marginTop: 1 }}>
                      {a.teamName}{a.nflTeam ? ` · ${a.nflTeam}` : ''}{a.isPick ? '' : ` · ${a.contractYearsRemaining}yr`}
                    </span>
                  </span>
                  <span className="tnum green" style={{ fontSize: 14, fontWeight: 700 }}>${a.currentPrice}</span>
                </button>
                {a.teamName !== userTeam && (
                  <button
                    onClick={() => toggleInterest(a)}
                    aria-label={starred ? 'Remove interest' : 'Mark interest'}
                    style={{ fontSize: 16, color: starred ? 'var(--iff-gold)' : 'var(--iff-subtext)', padding: 4 }}
                  >
                    {starred ? '★' : '☆'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {overlays}
    </div>
  )
}
