// RostersView — port of Views/RostersView.swift.
// By Team (chip switcher) and All Assets (search + position filter + price sort).
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { Segmented, PosBadge, LoadingList } from '../components/shared'
import AssetDetailView from '../components/AssetDetailView'
import SettingsView from './SettingsView'

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'Picks']

export default function RostersView({ setTab }) {
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
        <div style={{ overflowX: 'auto', padding: '0 14px 10px', borderBottom: '1px solid var(--iff-divider)' }}>
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
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
