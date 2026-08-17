// PowerRankingsView — all 12 teams at a glance, two ways.
//
//   Power Rankings — roster strength, ranked. Every number derived from
//     live rosters (see services/powerRankings.js), so it can never drift
//     the way a hand-maintained standings sheet does.
//   Cap Tracker    — luxury-tax exposure against the $300 threshold, which
//                    previously only ever surfaced as a warning mid-trade.
//
// Deliberately states its own formula in the UI: this is a salary-based
// ranking, not an opinion poll, and nobody should mistake it for one.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, ROSTER_CAP } from '../data/staticData'
import { computePowerRankings, leagueCapSummary } from '../services/powerRankings'
import { DetailOverlay, Segmented, TeamAvatar } from './shared'

const money = (n) => `$${Math.round(n)}`

export default function PowerRankingsView({ onClose }) {
  const { allDisplayAssets, activeSeason, userTeam } = useApp()
  const [view, setView] = useState('Power')

  const rows = useMemo(
    () => computePowerRankings(allDisplayAssets, fantasyTeams, activeSeason),
    [allDisplayAssets, activeSeason],
  )
  const summary = useMemo(() => leagueCapSummary(rows), [rows])
  const maxValue = summary.maxValue || 1

  return (
    <DetailOverlay title="League Power" onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Segmented options={['Power', 'Cap']} value={view} onChange={setView} />

        {view === 'Power' ? (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
              Ranked by total roster salary — in an auction league, price is the league's own
              valuation of a player, so it's the most honest strength signal available.
              Draft picks are listed but excluded from the ranking: they're real assets, not
              current strength.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => {
                const isMine = r.teamName === userTeam
                return (
                  <div
                    key={r.teamName}
                    className="iff-card"
                    style={{
                      padding: 12,
                      border: isMine ? '1.5px solid var(--iff-accent)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className="tnum"
                        style={{
                          fontSize: 18, fontWeight: 900, width: 28, textAlign: 'center', flexShrink: 0,
                          color: r.rank <= 3 ? 'var(--iff-gold)' : 'var(--iff-subtext)',
                        }}
                      >
                        {r.rank}
                      </span>
                      <TeamAvatar name={r.teamName} size={30} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>
                          {r.teamName}
                          {isMine && <span style={{ fontSize: 10, color: 'var(--iff-accent)', marginLeft: 6 }}>YOU</span>}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)' }}>
                          {r.playerCount} players · {r.pickCount} pick{r.pickCount === 1 ? '' : 's'}
                          {r.overCap && <span style={{ color: '#EF4444', fontWeight: 700 }}> · over cap</span>}
                        </span>
                      </span>
                      <span className="tnum" style={{ fontSize: 16, fontWeight: 800, color: 'var(--iff-green)' }}>
                        {money(r.rosterValue)}
                      </span>
                    </div>

                    {/* Value bar — star money vs depth money, scaled to the league leader */}
                    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--iff-elevated)', marginTop: 9 }}>
                      <span style={{ width: `${(r.starValue / maxValue) * 100}%`, background: 'var(--iff-gold)' }} />
                      <span style={{ width: `${(r.depthValue / maxValue) * 100}%`, background: 'rgba(244,162,97,0.35)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--iff-subtext)', marginTop: 5 }}>
                      <span>Top 5: <strong style={{ color: 'var(--iff-text)' }}>{money(r.starValue)}</strong> ({Math.round(r.starShare * 100)}%)</span>
                      <span>{r.topPlayers.map((p) => p.name).join(' · ') || '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="iff-card" style={{ padding: 14, display: 'flex', gap: 18 }}>
              <span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Threshold</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: 'var(--iff-gold)' }}>{money(ROSTER_CAP)}</span>
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>League avg</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 800 }}>{money(summary.avgCap)}</span>
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Over</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 800, color: summary.overCount > 0 ? '#EF4444' : 'var(--iff-text)' }}>
                  {summary.overCount}
                </span>
              </span>
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
              TAX DAT ASS — only drafted and kept salary counts toward the {money(ROSTER_CAP)} threshold.
              In-season waiver pickups are exempt until they're kept the following year.
            </div>

            {/* Flex rows rather than a table: the overlay is ~525px wide and a
                4-column table pushed Taxable/Room — the whole point of this
                view — off the right edge behind a scrollbar. Owner drops to a
                subtitle so the two numbers always stay visible. */}
            <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Team</span>
                <span style={{ width: 68, textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Taxable</span>
                <span style={{ width: 64, textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Room</span>
              </div>
              {[...rows].sort((a, b) => b.capTotal - a.capTotal).map((r, i) => (
                <div
                  key={r.teamName}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                    borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: r.teamName === userTeam ? 'rgba(230,57,70,0.07)' : undefined,
                  }}
                >
                  <TeamAvatar name={r.teamName} size={22} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.teamName}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.owner ?? '—'}
                    </span>
                  </span>
                  <span className="tnum" style={{ width: 68, textAlign: 'right', fontSize: 13, fontWeight: 800, color: r.overCap ? '#EF4444' : 'var(--iff-text)' }}>
                    {money(r.capTotal)}
                  </span>
                  <span className="tnum" style={{ width: 64, textAlign: 'right', fontSize: 12.5, color: r.capRoom < 0 ? '#EF4444' : 'var(--iff-green)' }}>
                    {r.capRoom < 0 ? `−${money(-r.capRoom)}` : money(r.capRoom)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DetailOverlay>
  )
}
