// AssetDetailView — port of AssetDetailView in CodeRedApp.swift.
// Prices across seasons, contract info, league FMK aggregate, own-signal
// picker, trade history, and the Propose Trade CTA.
import { useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { DetailOverlay } from './shared'

const SIGNALS = [
  { key: 'kill',  label: 'Kill',  glyph: '💀', color: '#EF4444' },
  { key: 'fuck',  label: 'Fuck',  glyph: '🔥', color: 'var(--iff-gold)' },
  { key: 'marry', label: 'Marry', glyph: '💍', color: '#22C55E' },
]

/** Overlay wrapper (mobile push / desktop panel). */
export default function AssetDetailView({ asset, onBack, onProposeTrade, desktop = 'panel' }) {
  return (
    <DetailOverlay title={asset.isPick ? 'Draft Pick' : 'Player'} onBack={onBack} desktop={desktop}>
      <AssetDetailBody asset={asset} onProposeTrade={onProposeTrade} />
    </DetailOverlay>
  )
}

/** The detail content itself — also rendered inline in the desktop roster pane. */
export function AssetDetailBody({ asset, onProposeTrade }) {
  const {
    activeSeason,
    allLeagueFMK,
    currentFMKSignal,
    setFMKSignal,
    removeFMKSignal,
    userTeam,
    loadAllLeagueInterests,
  } = useApp()

  useEffect(() => {
    loadAllLeagueInterests()
  }, [loadAllLeagueInterests])

  const mySignal = currentFMKSignal(asset.assetId)
  const counts = allLeagueFMK.reduce(
    (acc, s) => {
      if (s.assetId === asset.assetId) acc[s.signal] = (acc[s.signal] ?? 0) + 1
      return acc
    },
    { marry: 0, fuck: 0, kill: 0 },
  )

  const isMine = asset.teamName === userTeam
  const seasons = [activeSeason, activeSeason + 1, activeSeason + 2]

  function tapSignal(key) {
    if (mySignal === key) removeFMKSignal(asset.assetId)
    else setFMKSignal(asset, key)
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div className="iff-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }}>{asset.name}</div>
          <div style={{ fontSize: 13, color: 'var(--iff-subtext)', marginTop: 4 }}>
            {asset.isPick ? 'Draft Pick' : asset.position}
            {asset.nflTeam ? ` · ${asset.nflTeam}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 2 }}>
            Owned by <strong style={{ color: 'var(--iff-text)' }}>{asset.teamName}</strong>
          </div>
          {asset.ownedRank != null && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <span style={{ background: 'var(--iff-elevated)', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>
                {asset.position}<span style={{ color: 'var(--iff-gold)' }}>{asset.posRank}</span>
                <span style={{ color: 'var(--iff-subtext)', fontWeight: 400 }}> of {asset.posRankTotal}</span>
              </span>
              <span style={{ background: 'var(--iff-elevated)', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>
                #<span style={{ color: 'var(--iff-gold)' }}>{asset.ownedRank}</span>
                <span style={{ color: 'var(--iff-subtext)', fontWeight: 400 }}> of {asset.ownedRankTotal} owned</span>
              </span>
            </div>
          )}
        </div>

        {/* Prices */}
        <div className="iff-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Contract
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {seasons.map((yr) => (
              <div
                key={yr}
                style={{
                  flex: 1,
                  background: 'var(--iff-elevated)',
                  borderRadius: 10,
                  padding: '10px 8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{yr}</div>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: 'var(--iff-gold)' }}>
                  ${asset.prices?.[String(yr)] ?? 0}
                </div>
              </div>
            ))}
          </div>
          {!asset.isPick && (
            <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 10 }}>
              {asset.contractYearsRemaining} yr{asset.contractYearsRemaining === 1 ? '' : 's'} remaining
              {' · '}{asset.playerPool}
              {asset.rookieRound ? ` · R${asset.rookieRound} ${asset.rookieDraftYear}` : ''}
            </div>
          )}
        </div>

        {/* League FMK aggregate */}
        <div className="iff-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            League Interest
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
            <span>💍 <strong>{counts.marry}</strong></span>
            <span>🔥 <strong>{counts.fuck}</strong></span>
            <span>💀 <strong>{counts.kill}</strong></span>
          </div>

          {!isMine && (
            <>
              <hr className="divider" style={{ margin: '12px 0' }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                My Rating
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {SIGNALS.map((s) => {
                  const active = mySignal === s.key
                  return (
                    <button
                      key={s.key}
                      onClick={() => tapSignal(s.key)}
                      style={{
                        flex: 1,
                        padding: '10px 8px',
                        borderRadius: 10,
                        fontSize: 12,
                        fontWeight: 700,
                        color: active ? '#fff' : s.color,
                        background: active ? s.color : 'transparent',
                        border: `1.5px solid ${s.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{s.glyph}</span> {s.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Trade history */}
        {asset.tradeHistory?.length > 0 && (
          <div className="iff-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Trade History
            </div>
            {asset.tradeHistory.map((note, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--iff-subtext)', padding: '3px 0' }}>
                • {note}
              </div>
            ))}
          </div>
        )}

        {/* Propose trade */}
        {!isMine && (
          <button className="btn-primary" onClick={() => onProposeTrade(asset)}>
            Propose Trade for {asset.isPick ? asset.name : asset.name.split(' ').slice(-1)[0]}
          </button>
        )}
    </div>
  )
}
