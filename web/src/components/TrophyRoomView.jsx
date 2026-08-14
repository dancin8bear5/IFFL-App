// TrophyRoomView — the GRAND hall. Old-school NCAA trophy room treatment:
// championship banners in the rafters, an all-time podium, per-team display
// cases with trophies and brass plaques, and a records wall.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, teamByName } from '../data/staticData'
import { DetailOverlay, TeamAvatar } from './shared'
import { computeAllTimeStats, computeRecords, defaultSort } from '../services/leagueStats'

export default function TrophyRoomView({ onClose }) {
  const { leagueHistory } = useApp()
  const [showFormer, setShowFormer] = useState(false)

  const { rows, records, banners, formerCount } = useMemo(() => {
    const all = defaultSort(computeAllTimeStats(leagueHistory))
    const recs = computeRecords(all, leagueHistory)
    const bans = [...leagueHistory]
      .filter((s) => s.champion)
      .sort((a, b) => a.season - b.season)
      .map((s) => ({ season: s.season, team: s.champion, color: teamByName[s.champion]?.color ?? '#888' }))
    return {
      rows: showFormer ? all : all.filter((r) => r.active),
      records: recs,
      banners: bans, // banners are history — every championship hangs forever
      formerCount: all.filter((r) => !r.active).length,
    }
  }, [leagueHistory, showFormer])

  const podium = rows.slice(0, 3)

  return (
    <DetailOverlay title="Trophy Room" onBack={onClose} desktop="wide">
      <div className="troom">
        {/* ── Marquee ── */}
        <header className="troom-hero">
          <div className="troom-est">INSANITY FANTASY FOOTBALL LEAGUE · EST. 2008</div>
          <h1 className="troom-title">TROPHY ROOM</h1>
          <div className="troom-rule">
            <span>❦</span>
          </div>
        </header>

        {leagueHistory.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">🏆</div>
            <div className="title">The hall awaits</div>
            <div>Career stats appear once league history is seeded.</div>
          </div>
        ) : (
          <>
            {/* ── Championship banners in the rafters ── */}
            <section className="troom-rafters">
              <div className="troom-rafter-beam" />
              <div className="troom-banner-row">
                {banners.map((b) => (
                  <div key={b.season} className="troom-banner" style={{ '--banner-color': b.color }}>
                    <div className="troom-banner-year">{b.season}</div>
                    <div className="troom-banner-team">{b.team.toUpperCase()}</div>
                    <div className="troom-banner-label">CHAMPIONS</div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── All-time podium ── */}
            {podium.length === 3 && (
              <section className="troom-podium-wrap">
                <div className="troom-section-label">ALL-TIME STANDINGS</div>
                <div className="troom-podium">
                  {[podium[1], podium[0], podium[2]].map((r, i) => {
                    const spot = i === 1 ? 1 : i === 0 ? 2 : 3
                    return (
                      <div key={r.team} className={`troom-step troom-step-${spot}`}>
                        <TeamAvatar name={r.team} size={spot === 1 ? 52 : 42} />
                        <div className="troom-step-team">{r.team}</div>
                        <div className="troom-step-belts">{'🏆'.repeat(Math.min(r.championships, 5)) || '—'}</div>
                        <div className="troom-step-block">
                          <span>{spot === 1 ? '1ST' : spot === 2 ? '2ND' : '3RD'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ── Records wall ── */}
            {records.length > 0 && (
              <section>
                <div className="troom-section-label">LEAGUE RECORDS</div>
                <div className="troom-records">
                  {records.map((r) => (
                    <div key={r.label} className="troom-plaque">
                      <div className="troom-plaque-label">{r.label}</div>
                      <div className="troom-plaque-team">{r.team}</div>
                      <div className="troom-plaque-value">{r.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Display cases ── */}
            <section>
              <div className="troom-section-label">HALL OF FRANCHISES</div>
              {formerCount > 0 && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <button
                    onClick={() => setShowFormer((v) => !v)}
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '5px 14px', borderRadius: 16,
                      fontFamily: 'system-ui, sans-serif',
                      background: showFormer ? 'var(--iff-gold)' : 'var(--iff-elevated)',
                      color: showFormer ? '#241A05' : 'var(--iff-subtext)',
                    }}
                  >
                    {showFormer ? `SHOWING ${formerCount} FORMER MEMBERS` : `SHOW ${formerCount} FORMER MEMBERS`}
                  </button>
                </div>
              )}
              <div className="troom-cases">
                {rows.map((r, rank) => (
                  <div key={r.team} className="troom-case">
                    <div className="troom-case-header">
                      <span className="troom-case-rank tnum">#{rank + 1}</span>
                      <TeamAvatar name={r.team} size={34} />
                      <span className="troom-case-team">{r.team}</span>
                    </div>

                    <div className="troom-shelf">
                      {r.championships > 0 || r.runnerUps > 0 ? (
                        <>
                          {Array.from({ length: r.championships }, (_, i) => (
                            <span key={`c${i}`} className="troom-trophy" title="League Champion">🏆</span>
                          ))}
                          {Array.from({ length: r.runnerUps }, (_, i) => (
                            <span key={`r${i}`} className="troom-trophy silver" title="Runner-Up">🥈</span>
                          ))}
                        </>
                      ) : (
                        <span className="troom-shelf-empty">THE SHELF AWAITS</span>
                      )}
                    </div>
                    <div className="troom-shelf-board" />

                    <div className="troom-brass">
                      <div className="troom-brass-row">
                        <span>RECORD</span>
                        <strong className="tnum">
                          {r.w}-{r.l}{r.t ? `-${r.t}` : ''} · {(r.pct * 100).toFixed(1)}%
                        </strong>
                      </div>
                      <div className="troom-brass-row">
                        <span>FINALS</span>
                        <strong className="tnum">{r.finals}</strong>
                        <span>TOP 3</span>
                        <strong className="tnum">{r.top3}</strong>
                        <span>PLAYOFFS</span>
                        <strong className="tnum">{r.playoffs}</strong>
                      </div>
                      <div className="troom-brass-row">
                        <span>BEST</span>
                        <strong className="tnum">{r.bestFinish ? `#${r.bestFinish}` : '—'}</strong>
                        <span>AVG</span>
                        <strong className="tnum">{r.avgFinish?.toFixed(1) ?? '—'}</strong>
                        {r.pointsFor != null && (
                          <>
                            <span>PTS</span>
                            <strong className="tnum">{r.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="troom-finishes">
                      {r.finishes.map((f) => (
                        <span
                          key={f.season}
                          className={`troom-finish ${f.place === 1 ? 'gold' : f.place <= 3 ? 'podium' : ''}`}
                          title={`${f.season}: #${f.place}${f.record ? ` (${f.record})` : ''}`}
                        >
                          '{String(f.season).slice(2)}·{f.place}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <footer className="troom-footer">
              {fantasyTeams.length} FRANCHISES · {leagueHistory.length} SEASONS · ONE BELT
            </footer>
          </>
        )}
      </div>
    </DetailOverlay>
  )
}
