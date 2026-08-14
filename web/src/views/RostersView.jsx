// RostersView — port of Views/RostersView.swift.
// Mobile: By Team chips / All Assets search (unchanged from v1).
// Desktop: master–detail — team list pane · sortable full table · detail pane.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop, useMediaQuery } from '../hooks/useBreakpoint'
import { fantasyTeams } from '../data/staticData'
import { Segmented, PosBadge, LoadingList, TeamAvatar, ChipScroller } from '../components/shared'
import AssetDetailView, { AssetDetailBody } from '../components/AssetDetailView'
import SettingsView from './SettingsView'

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'Picks']

export default function RostersView({ setTab }) {
  const isDesktop = useIsDesktop()
  return isDesktop ? <RostersDesktop setTab={setTab} /> : <RostersMobile setTab={setTab} />
}

/* ═══════════════ Desktop: master–detail ═══════════════ */

function RostersDesktop({ setTab }) {
  const {
    allDisplayAssets, selectedTeam, setSelectedTeam, isInitialLoadComplete,
    userTeam, interestedAssetIds, toggleInterest, proposeTradeFor, activeSeason,
  } = useApp()

  const [allMode, setAllMode] = useState(false)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [sort, setSort] = useState({ key: 'p0', desc: true }) // p0/p1/p2 = season prices
  const [selectedAsset, setSelectedAsset] = useState(null)

  // ≥1150px: inline detail pane; 900–1150px: detail opens as a drawer instead
  const hasDetailPane = useMediaQuery('(min-width: 1150px)')

  const seasons = [activeSeason, activeSeason + 1, activeSeason + 2]

  const capByTeam = useMemo(() => {
    const map = {}
    for (const a of allDisplayAssets) map[a.teamName] = (map[a.teamName] ?? 0) + a.currentPrice
    return map
  }, [allDisplayAssets])

  const rows = useMemo(() => {
    let list = allMode ? allDisplayAssets : allDisplayAssets.filter((a) => a.teamName === selectedTeam)
    if (posFilter === 'Picks') list = list.filter((a) => a.isPick)
    else if (posFilter !== 'All') list = list.filter((a) => a.position === posFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.teamName.toLowerCase().includes(q))
    }
    const dir = sort.desc ? -1 : 1
    const val = (a) => {
      if (sort.key === 'name') return a.name.toLowerCase()
      if (sort.key === 'pos') return a.position
      if (sort.key === 'team') return a.teamName
      const yr = seasons[Number(sort.key[1])]
      return a.prices?.[String(yr)] ?? 0
    }
    return [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0))
  }, [allDisplayAssets, allMode, selectedTeam, posFilter, search, sort, seasons])

  function clickSort(key) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key.startsWith('p') }))
  }

  function handleProposeTrade(asset) {
    proposeTradeFor(asset)
    setTab(2)
  }

  const arrow = (key) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')

  return (
    <div>
      <div className="dash-hero-desktop">
        <h1>Rosters</h1>
        <span className="season-chip">{rows.length} assets shown</span>
      </div>

      <div className="roster-desktop">
        {/* ── Team pane ── */}
        <aside className="roster-teams">
          <input
            type="search"
            placeholder="Search all assets…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value) setAllMode(true) }}
            style={{ marginBottom: 10 }}
          />
          <button
            className={`roster-team-item ${allMode ? 'active' : ''}`}
            onClick={() => { setAllMode(true); setSelectedAsset(null) }}
          >
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--iff-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>∀</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 700 }}>All Assets</span>
          </button>
          <div style={{ height: 1, background: 'var(--iff-divider)', margin: '6px 0' }} />
          {fantasyTeams.map((t) => {
            const active = !allMode && t.name === selectedTeam
            return (
              <button
                key={t.name}
                className={`roster-team-item ${active ? 'active' : ''}`}
                onClick={() => { setAllMode(false); setSelectedTeam(t.name); setSelectedAsset(null) }}
              >
                <TeamAvatar name={t.name} size={32} />
                <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.name}{t.name === userTeam ? ' · me' : ''}
                  </span>
                </span>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--iff-gold)' }}>
                  ${capByTeam[t.name] ?? 0}
                </span>
              </button>
            )
          })}
        </aside>

        {/* ── Table pane ── */}
        <div className="roster-table-pane">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: posFilter === p ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: posFilter === p ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="iff-card" style={{ overflow: 'hidden' }}>
            <div className={`roster-thead ${allMode ? 'with-team' : ''}`}>
              <button onClick={() => clickSort('pos')}>Pos{arrow('pos')}</button>
              <button onClick={() => clickSort('name')} style={{ textAlign: 'left' }}>Player{arrow('name')}</button>
              {allMode && <button onClick={() => clickSort('team')} style={{ textAlign: 'left' }}>Team{arrow('team')}</button>}
              <span>Yrs</span>
              {seasons.map((yr, i) => (
                <button key={yr} onClick={() => clickSort(`p${i}`)} style={{ textAlign: 'right' }}>
                  '{String(yr).slice(2)}{arrow(`p${i}`)}
                </button>
              ))}
              <span />
            </div>

            {!isInitialLoadComplete ? (
              <LoadingList count={6} />
            ) : rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}><div>No assets match.</div></div>
            ) : (
              rows.map((a) => {
                const starred = interestedAssetIds.has(a.assetId)
                const active = selectedAsset?.id === a.id
                return (
                  <div
                    key={a.id}
                    className={`roster-trow ${active ? 'active' : ''} ${allMode ? 'with-team' : ''}`}
                    onClick={() => setSelectedAsset(a)}
                  >
                    <PosBadge position={a.position} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{a.name}</span>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)' }}>
                        {a.isPick ? (a.tradeHistory.at(-1) ?? 'Original') : (a.nflTeam ?? '—')}
                      </span>
                    </span>
                    {allMode && <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>{a.teamName}</span>}
                    <span className="tnum" style={{ fontSize: 12, color: 'var(--iff-subtext)', textAlign: 'center' }}>
                      {a.isPick ? '—' : a.contractYearsRemaining}
                    </span>
                    {seasons.map((yr, i) => (
                      <span key={yr} className="tnum" style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--iff-green)' : 'var(--iff-subtext)', textAlign: 'right' }}>
                        ${a.prices?.[String(yr)] ?? 0}
                      </span>
                    ))}
                    {a.teamName !== userTeam ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleInterest(a) }}
                        aria-label={starred ? 'Remove interest' : 'Mark interest'}
                        style={{ fontSize: 15, color: starred ? 'var(--iff-gold)' : 'var(--iff-subtext)', textAlign: 'center' }}
                      >
                        {starred ? '★' : '☆'}
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Detail: drawer fallback when the inline pane is hidden ── */}
        {!hasDetailPane && selectedAsset && (
          <AssetDetailView
            asset={selectedAsset}
            onBack={() => setSelectedAsset(null)}
            onProposeTrade={handleProposeTrade}
            desktop="panel"
          />
        )}

        {/* ── Detail pane (≥1150px) ── */}
        <aside className="roster-detail">
          {selectedAsset ? (
            <div className="iff-card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--iff-divider)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--iff-subtext)' }}>
                  {selectedAsset.isPick ? 'DRAFT PICK' : 'PLAYER'}
                </span>
                <button onClick={() => setSelectedAsset(null)} aria-label="Close detail" style={{ color: 'var(--iff-subtext)', fontSize: 14 }}>✕</button>
              </div>
              <AssetDetailBody asset={selectedAsset} onProposeTrade={handleProposeTrade} />
            </div>
          ) : (
            <div className="iff-card empty-state" style={{ padding: '48px 20px' }}>
              <div className="glyph">👈</div>
              <div style={{ fontSize: 13 }}>Select a player to see contract, ratings &amp; trade options.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ═══════════════ Mobile (unchanged from v1) ═══════════════ */

function RostersMobile({ setTab }) {
  const {
    allDisplayAssets, selectedTeam, setSelectedTeam, isInitialLoadComplete,
    userTeam, interestedAssetIds, toggleInterest, proposeTradeFor,
  } = useApp()

  const [mode, setMode] = useState('By Team')
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [priceDesc, setPriceDesc] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [detailAsset, setDetailAsset] = useState(null)

  const teamAssets = useMemo(
    () =>
      allDisplayAssets
        .filter((a) => a.teamName === selectedTeam)
        .sort((a, b) => b.currentPrice - a.currentPrice),
    [allDisplayAssets, selectedTeam],
  )

  const filteredAssets = useMemo(() => {
    let list = allDisplayAssets
    if (posFilter === 'Picks') list = list.filter((a) => a.isPick)
    else if (posFilter !== 'All') list = list.filter((a) => a.position === posFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.teamName.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => (priceDesc ? b.currentPrice - a.currentPrice : a.currentPrice - b.currentPrice))
  }, [allDisplayAssets, posFilter, search, priceDesc])

  function handleProposeTrade(asset) {
    setDetailAsset(null)
    proposeTradeFor(asset)
    setTab(2)
  }

  const list = mode === 'By Team' ? teamAssets : filteredAssets

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">Rosters</div>
        <div className="nav-side right">
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </div>

      <Segmented options={['By Team', 'All Assets']} value={mode} onChange={setMode} />

      {mode === 'By Team' ? (
        <div style={{ padding: '0 14px 10px', borderBottom: '1px solid var(--iff-divider)' }}>
          <ChipScroller>
            <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
              {fantasyTeams.map((t) => {
                const active = t.name === selectedTeam
                return (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTeam(t.name)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      background: active ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                      color: active ? '#fff' : 'var(--iff-subtext)',
                    }}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </ChipScroller>
        </div>
      ) : (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--iff-divider)' }}>
          <input
            type="search"
            placeholder="Search players, picks, teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: posFilter === p ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: posFilter === p ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPriceDesc((v) => !v)}
              style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--iff-gold)', whiteSpace: 'nowrap' }}
            >
              Price {priceDesc ? '↓' : '↑'}
            </button>
          </div>
        </div>
      )}

      {!isInitialLoadComplete ? (
        <LoadingList />
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">🔍</div>
          <div className="title">No assets found</div>
          <div>{mode === 'By Team' ? 'This roster is empty.' : 'Try a different search or filter.'}</div>
        </div>
      ) : (
        <div>
          {list.map((a) => {
            const starred = interestedAssetIds.has(a.assetId)
            const notMine = a.teamName !== userTeam
            return (
              <div
                key={a.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--iff-divider)' }}
              >
                <button
                  onClick={() => setDetailAsset(a)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left' }}
                >
                  <PosBadge position={a.position} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, lineHeight: 1.25 }}>
                      {a.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', marginTop: 1 }}>
                      {mode === 'All Assets' ? a.teamName : a.isPick ? (a.tradeHistory.at(-1) ?? 'Original') : (a.nflTeam ?? '')}
                    </span>
                  </span>
                  <span className="tnum green" style={{ fontSize: 14, fontWeight: 700 }}>${a.currentPrice}</span>
                </button>
                {notMine && (
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

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {detailAsset && (
        <AssetDetailView
          asset={detailAsset}
          onBack={() => setDetailAsset(null)}
          onProposeTrade={handleProposeTrade}
        />
      )}
    </div>
  )
}
