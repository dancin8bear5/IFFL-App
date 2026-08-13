// LeagueView — port of Views/LeagueView.swift + LeagueHistoryView.swift.
// Standings (latest season), Scores (off-season placeholder), History
// (trophy case + expandable season cards).
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { Segmented, BeltRow } from '../components/shared'
import { teamByName } from '../data/staticData'
import TrophyCaseView from '../components/TrophyCaseView'
import SettingsView from './SettingsView'

export default function LeagueView() {
  const { leagueHistory, loadLeagueHistory, activeSeason, isOffSeason } = useApp()
  const [section, setSection] = useState('Standings')
  const [showSettings, setShowSettings] = useState(false)
  const [showTrophyCase, setShowTrophyCase] = useState(false)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    loadLeagueHistory()
  }, [loadLeagueHistory])

  const latest = leagueHistory[0] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">League</div>
        <div className="nav-side right">
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </div>

      <Segmented options={['Standings', 'Scores', 'History']} value={section} onChange={setSection} />

      {section === 'Standings' && (
        <div style={{ padding: '0 14px 14px' }}>
          {!latest ? (
            <div className="empty-state">
              <div className="glyph">📊</div>
              <div className="title">No standings yet</div>
              <div>League history hasn't been loaded into the database.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 2px 8px' }}>
                {latest.season} Final Standings
              </div>
              <div className="iff-card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 60px', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
                  <span /><span>Team</span><span style={{ textAlign: 'center' }}>W-L</span><span style={{ textAlign: 'right' }}>PF</span>
                </div>
                {[...(latest.standings ?? [])].sort((a, b) => a.place - b.place).map((s) => (
                  <StandingRow key={s.teamName} standing={s} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {section === 'Scores' && (
        <div className="empty-state" style={{ paddingTop: 70 }}>
          <div className="glyph">🏈</div>
          <div className="title">{isOffSeason ? 'Off-Season' : 'Season Over'}</div>
          <div style={{ lineHeight: 1.7 }}>
            Live scores return when the {activeSeason} season kicks off.
            <br />
            NFL Kickoff: <strong className="gold">Sep 10, {activeSeason}</strong>
          </div>
        </div>
      )}

      {section === 'History' && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Trophy case banner */}
          <button
            className="iff-card"
            onClick={() => setShowTrophyCase(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left',
              background: 'linear-gradient(135deg, rgba(244,162,97,0.14), rgba(244,162,97,0.03))',
            }}
          >
            <span style={{ width: 44, height: 44, background: 'rgba(244,162,97,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏆</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>All-Time Trophy Case</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
                Belt wins, career stats &amp; finishes
              </span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
          </button>

          {leagueHistory.length === 0 ? (
            <div className="empty-state">
              <div className="glyph">📜</div>
              <div className="title">No history yet</div>
              <div>Season history will appear once seeded by the commissioner.</div>
            </div>
          ) : (
            leagueHistory.map((season) => (
              <SeasonCard
                key={season.season}
                season={season}
                open={expanded === season.season}
                onToggle={() => setExpanded(expanded === season.season ? null : season.season)}
              />
            ))
          )}
        </div>
      )}

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {showTrophyCase && <TrophyCaseView onClose={() => setShowTrophyCase(false)} />}
    </div>
  )
}

function StandingRow({ standing }) {
  const placeColor =
    standing.place === 1 ? 'var(--iff-gold)' : standing.place === 2 ? '#B8B8C8' : standing.place === 3 ? '#CD7F32' : 'var(--iff-subtext)'
  const belts = teamByName[standing.teamName]?.beltWins ?? 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 60px', padding: '8px 14px', fontSize: 13, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span className="tnum" style={{ fontWeight: 700, color: placeColor }}>{standing.place}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {standing.teamName} <BeltRow count={belts} size={8} />
      </span>
      <span className="tnum" style={{ textAlign: 'center', color: 'var(--iff-subtext)', fontSize: 12 }}>{standing.record ?? '—'}</span>
      <span className="tnum" style={{ textAlign: 'right', color: standing.place <= 4 ? 'var(--iff-green)' : 'var(--iff-subtext)', fontSize: 12 }}>
        {standing.pointsFor != null ? standing.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
      </span>
    </div>
  )
}

function SeasonCard({ season, open, onToggle }) {
  return (
    <div className="iff-card" style={{ overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 16px', textAlign: 'left' }}>
        <span>
          <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', fontWeight: 600, marginBottom: 2 }}>SEASON</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>{season.season}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
          <span className="gold" style={{ fontSize: 16 }}>🏆</span> {season.champion}
        </span>
        <span style={{ fontSize: 11, color: 'var(--iff-subtext)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ background: 'var(--iff-elevated)', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
            {[...(season.standings ?? [])].sort((a, b) => a.place - b.place).map((s) => (
              <div key={s.teamName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="tnum" style={{ width: 18, fontWeight: 600, color: s.place === 1 ? 'var(--iff-gold)' : s.place === 2 ? '#B8B8C8' : s.place === 3 ? '#CD7F32' : 'var(--iff-subtext)' }}>
                  {s.place}
                </span>
                <span style={{ flex: 1 }}>{s.teamName}</span>
                <span className="tnum" style={{ color: 'var(--iff-subtext)' }}>{s.record ?? ''}</span>
              </div>
            ))}
          </div>
          {(season.notableTrades ?? []).map((t, i) => (
            <div key={i} style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(244,162,97,0.07)', borderRadius: 8, borderLeft: '2px solid var(--iff-gold)', fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--iff-text)' }}>Notable:</strong> {t}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
