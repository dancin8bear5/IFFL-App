// TrophyCaseView — port of Views/TrophyCaseView.swift.
// Career stats per team computed from leagueHistory: championships,
// runner-ups, podiums, best/average finish, seasons played.
import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { DetailOverlay, TeamAvatar, BeltRow } from './shared'

function computeCareerStats(teamName, history) {
  const finishes = []
  for (const season of history) {
    const entry = (season.standings ?? []).find((s) => s.teamName === teamName)
    if (entry) finishes.push({ season: season.season, place: entry.place, record: entry.record })
  }
  const championships = history.filter((s) => s.champion === teamName).length
  const runnerUps = history.filter((s) => s.runnerUp === teamName).length
  const podiums = finishes.filter((f) => f.place <= 3).length
  const bestFinish = finishes.length ? Math.min(...finishes.map((f) => f.place)) : null
  const avgFinish = finishes.length
    ? finishes.reduce((sum, f) => sum + f.place, 0) / finishes.length
    : null
  return { teamName, championships, runnerUps, podiums, bestFinish, avgFinish, seasons: finishes.length, finishes }
}

export default function TrophyCaseView({ onClose }) {
  const { leagueHistory } = useApp()

  const stats = useMemo(() => {
    const all = fantasyTeams.map((t) => computeCareerStats(t.name, leagueHistory))
    return all.sort(
      (a, b) =>
        b.championships - a.championships ||
        b.runnerUps - a.runnerUps ||
        b.podiums - a.podiums ||
        (a.avgFinish ?? 99) - (b.avgFinish ?? 99),
    )
  }, [leagueHistory])

  return (
    <DetailOverlay title="Trophy Case" onBack={onClose} desktop="wide">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {leagueHistory.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">🏆</div>
            <div className="title">Trophy Case is empty</div>
            <div>Career stats appear once league history is seeded.</div>
          </div>
        ) : (
          stats.map((s, rank) => (
            <div key={s.teamName} className="iff-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: 'var(--iff-subtext)', width: 20 }}>
                  {rank + 1}
                </span>
                <TeamAvatar name={s.teamName} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{s.teamName}</span>
                    <BeltRow count={s.championships} size={10} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 2 }}>
                    {s.seasons} season{s.seasons === 1 ? '' : 's'} tracked
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
                <StatCell value={s.championships} label="Belts" gold />
                <StatCell value={s.runnerUps} label="Runner-Up" />
                <StatCell value={s.podiums} label="Top 3" />
                <StatCell value={s.avgFinish != null ? s.avgFinish.toFixed(1) : '—'} label="Avg Finish" />
              </div>

              {s.finishes.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
                  {[...s.finishes]
                    .sort((a, b) => b.season - a.season)
                    .map((f) => (
                      <span
                        key={f.season}
                        title={`${f.season}: #${f.place}`}
                        className="tnum"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '3px 7px',
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                          background:
                            f.place === 1 ? 'rgba(244,162,97,0.2)' : f.place <= 3 ? 'rgba(255,255,255,0.08)' : 'var(--iff-elevated)',
                          color: f.place === 1 ? 'var(--iff-gold)' : f.place <= 3 ? 'var(--iff-text)' : 'var(--iff-subtext)',
                        }}
                      >
                        '{String(f.season).slice(2)} · #{f.place}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </DetailOverlay>
  )
}

function StatCell({ value, label, gold }) {
  return (
    <div style={{ background: 'var(--iff-elevated)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
      <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: gold ? 'var(--iff-gold)' : 'var(--iff-text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 }}>
        {label}
      </div>
    </div>
  )
}
