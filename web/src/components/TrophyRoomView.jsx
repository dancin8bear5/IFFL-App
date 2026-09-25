// TrophyRoomView — the GRAND hall. Old-school NCAA trophy room treatment:
// championship banners in the rafters, an all-time podium, per-team display
// cases with trophies and brass plaques, and a records wall.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, teamByName, isActiveTeam } from '../data/staticData'
import { DetailOverlay, TeamAvatar } from './shared'
import TeamLink from './TeamLink'
import TrophyAnalytics from './TrophyAnalytics'
import TrophyHistoryCharts from './TrophyHistoryCharts'
import TrophyDraftCharts from './TrophyDraftCharts'
import TrophyLineupCharts from './TrophyLineupCharts'
import RookieDraftBoard from './RookieDraftBoard'
import { rookieClass2026 } from '../data/rookieDraft2026'
import { rookieDraftHistory } from '../data/rookieDraftHistory'
import {
  computeAllTimeStats, computeRecords, defaultSort,
  computeSuperlatives, computeDroughts, ownerName,
} from '../services/leagueStats'

const ordinal = (n) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

function ExtremeCard({ label, color, headline, detail }) {
  return (
    <div className="iff-card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, color, marginTop: 5, lineHeight: 1.25 }}>{headline}</div>
      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 4, lineHeight: 1.45 }}>{detail}</div>
    </div>
  )
}

/**
 * A scope's record cards (game or player extremes). Members see the section
 * once records exist; the commissioner also sees an empty-state prompt so
 * the structure is ready as data gets gathered going forward.
 */
function RecordScopeSection({ label, scope, records, isAdmin, hint }) {
  const mine = records.filter((r) => r.scope === scope)
  if (mine.length === 0 && !isAdmin) return null
  return (
    <section>
      <div className="troom-section-label">{label}</div>
      {mine.length === 0 ? (
        <div className="iff-card" style={{ padding: '14px 16px', fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.55, fontFamily: 'system-ui, sans-serif' }}>
          No {scope} records yet — {hint}. Add them from Settings → Admin → Records as the data
          comes in. (Only you can see this note.)
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {mine.map((r) => (
            <ExtremeCard
              key={r.id}
              label={r.label}
              color={r.tone === 'low' ? '#F87171' : '#4ADE80'}
              headline={`${r.team ? ownerName(r.team) : ''}${r.team && r.player ? ' — ' : ''}${r.player ?? ''}${r.value ? ` — ${r.value}` : ''}`}
              detail={[r.season, r.week ? `Week ${r.week}` : null, r.detail].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** Blue chip for short droughts, red for long (6+), gray 'never (N yrs)'. */
function DroughtBadge({ drought, seasons, activeLabel }) {
  if (drought == null) {
    return (
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--iff-subtext)', background: 'var(--iff-elevated)', padding: '3px 9px', borderRadius: 12, whiteSpace: 'nowrap' }}>
        never{seasons ? ` (${seasons} yrs)` : ''}
      </span>
    )
  }
  if (drought === 0 && activeLabel) {
    return (
      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#60A5FA', background: 'rgba(96,165,250,0.15)', padding: '3px 10px', borderRadius: 12, whiteSpace: 'nowrap' }}>
        {activeLabel}
      </span>
    )
  }
  const long = drought >= 6
  return (
    <span
      className="tnum"
      style={{
        fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 12,
        color: long ? '#F87171' : '#60A5FA',
        background: long ? 'rgba(248,113,113,0.15)' : 'rgba(96,165,250,0.15)',
      }}
    >
      {drought}
    </span>
  )
}

// Every rookie class we hold. 2026 comes from the Keeper Master with real
// slots; 2017-2025 were recovered from the ESPN export by
// scripts/extract-rookie-history.mjs. The rookie draft began in 2017, so
// this is the complete history — there is nothing earlier to find.
//
// Recovered classes often can't name a slot. Rookie contracts were a
// sliding scale through 2021 ($12 = 1.01 down to $4 = 1.05), so the top
// five of each of those drafts is exact, but $2 covers all of 1.06-1.12
// and $1 the whole second round; from 2022 the scale went flat and every
// first-rounder cost $2. Those picks carry the round and no slot, which is
// the honest answer rather than a guessed one.
const ROOKIE_CLASSES = { ...rookieDraftHistory, 2026: rookieClass2026 }
const ROOKIE_SEASONS = Object.keys(ROOKIE_CLASSES).map(Number).sort((a, b) => b - a)

export default function TrophyRoomView({ onClose }) {
  const [rookieSeason, setRookieSeason] = useState(ROOKIE_SEASONS[0])
  const { leagueHistory, leagueRecords, loadLeagueRecords, loadHistoryMatchups, loadHistoryAggregates, isAdmin } = useApp()
  const [showFormer, setShowFormer] = useState(false)

  useEffect(() => {
    loadLeagueRecords()
    loadHistoryMatchups()
    loadHistoryAggregates()
  }, [loadLeagueRecords, loadHistoryMatchups, loadHistoryAggregates])

  const { rows, records, banners, formerCount, superlatives, droughts } = useMemo(() => {
    const all = defaultSort(computeAllTimeStats(leagueHistory))
    // One toggle governs the whole room. It used to filter only the standings
    // table, which let a departed manager hold "All-Time Wins" on a wall about
    // the people still in the league.
    const eligible = showFormer ? () => true : (team) => isActiveTeam(team)
    const recs = computeRecords(all, leagueHistory, eligible)
    const bans = [...leagueHistory]
      .filter((s) => s.champion)
      .sort((a, b) => a.season - b.season)
      .map((s) => ({ season: s.season, team: s.champion, color: teamByName[s.champion]?.color ?? '#888' }))
    return {
      rows: showFormer ? all : all.filter((r) => r.active),
      records: recs,
      banners: bans, // banners are history — every championship hangs forever
      formerCount: all.filter((r) => !r.active).length,
      superlatives: leagueHistory.length ? computeSuperlatives(leagueHistory, eligible) : null,
      droughts: leagueHistory.length ? computeDroughts(leagueHistory) : [],
    }
  }, [leagueHistory, showFormer])

  // Commissioner-entered extremes get the same gate as the computed ones —
  // a record with no team attached is league-wide and always shows.
  const visibleRecords = useMemo(
    () => (showFormer ? leagueRecords : leagueRecords.filter((r) => !r.team || isActiveTeam(r.team))),
    [leagueRecords, showFormer],
  )

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
            <BannerRafters banners={banners} />

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
                        <div className="troom-step-team"><TeamLink name={r.team} /></div>
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
                      <div className="troom-plaque-team"><TeamLink name={r.team} /></div>
                      <div className="troom-plaque-value">{r.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Season extremes ── */}
            {superlatives?.bestSeason && (
              <section>
                <div className="troom-section-label">SEASON EXTREMES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  <ExtremeCard
                    label="Best Single Season"
                    color="#4ADE80"
                    headline={`${ownerName(superlatives.bestSeason.team)} — ${superlatives.bestSeason.record} (${(superlatives.bestSeason.pct * 100).toFixed(1)}%)`}
                    detail={`${superlatives.bestSeason.season} · ${superlatives.bestSeason.champion ? 'won the belt' : `finished #${superlatives.bestSeason.place}${superlatives.bestSeason.place === 2 ? ', no ring to show for it' : ''}`}`}
                  />
                  {superlatives.worstSeason && (
                    <ExtremeCard
                      label="Worst Single Season"
                      color="#F87171"
                      headline={`${ownerName(superlatives.worstSeason.team)} — ${superlatives.worstSeason.record} (${(superlatives.worstSeason.pct * 100).toFixed(1)}%)`}
                      detail={`${superlatives.worstSeason.season} · finished #${superlatives.worstSeason.place}`}
                    />
                  )}
                  {superlatives.turnaround && (
                    <ExtremeCard
                      label="Biggest 1-Year Turnaround"
                      color="#4ADE80"
                      headline={`${ownerName(superlatives.turnaround.team)} — ${ordinal(superlatives.turnaround.from)} → ${ordinal(superlatives.turnaround.to)}`}
                      detail={`${superlatives.turnaround.seasonFrom} to ${superlatives.turnaround.seasonTo}`}
                    />
                  )}
                  {superlatives.collapse && (
                    <ExtremeCard
                      label="Biggest 1-Year Collapse"
                      color="#F87171"
                      headline={`${ownerName(superlatives.collapse.team)} — ${ordinal(superlatives.collapse.from)} → ${ordinal(superlatives.collapse.to)}`}
                      detail={`${superlatives.collapse.seasonFrom} to ${superlatives.collapse.seasonTo}`}
                    />
                  )}
                </div>
              </section>
            )}

            {/* ── Game & player extremes — commissioner-entered records,
                   gathered going forward as weekly data accumulates ── */}
            <RecordScopeSection
              label="GAME EXTREMES"
              scope="game"
              records={visibleRecords}
              isAdmin={isAdmin}
              hint="single-game records — highest score, biggest blowout, closest margin"
            />
            <RecordScopeSection
              label="PLAYER EXTREMES"
              scope="player"
              records={visibleRecords}
              isAdmin={isAdmin}
              hint="individual performances — best player game, draft bargains, bench tragedies"
            />

            {/* ── Distributions: the spread behind the single numbers ── */}
            <TrophyAnalytics showFormer={showFormer} />

            {/* ── Game-history analytics: rivalries, luck, clutch ── */}
            <TrophyHistoryCharts showFormer={showFormer} />

            {/* ── Draft & scoring analytics: eras, spend, ROI ── */}
            <TrophyDraftCharts showFormer={showFormer} />

            {/* ── Lineup analytics: bench regret, roster DNA (2018+) ── */}
            <TrophyLineupCharts showFormer={showFormer} />

            {/* ── Drought table ── */}
            {droughts.length > 0 && (
              <section>
                <div className="troom-section-label">CHAMPIONSHIP &amp; TOP-3 DROUGHT</div>
                <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
                      <thead>
                        <tr style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'left' }}>
                          <th style={{ padding: '10px 14px' }}>Owner</th>
                          <th style={{ padding: '10px 8px' }}>Last Title</th>
                          <th style={{ padding: '10px 8px' }}>Title Drought</th>
                          <th style={{ padding: '10px 8px' }}>Last Top-3</th>
                          <th style={{ padding: '10px 14px 10px 8px' }}>Top-3 Drought</th>
                        </tr>
                      </thead>
                      <tbody>
                        {droughts.map((d, i) => (
                          <tr key={d.team} style={{ borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <td style={{ padding: '9px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <TeamAvatar name={d.team} size={20} />
                                {d.owner}
                              </span>
                            </td>
                            <td className="tnum" style={{ padding: '9px 8px', color: 'var(--iff-subtext)' }}>{d.lastTitle ?? '—'}</td>
                            <td style={{ padding: '9px 8px' }}>
                              <DroughtBadge drought={d.titleDrought} seasons={d.seasonsPlayed} activeLabel="active champ" />
                            </td>
                            <td className="tnum" style={{ padding: '9px 8px', color: 'var(--iff-subtext)' }}>{d.lastTop3 ?? '—'}</td>
                            <td style={{ padding: '9px 14px 9px 8px' }}>
                              <DroughtBadge drought={d.top3Drought} seasons={d.seasonsPlayed} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ── Rookie draft history ── */}
            <section>
              <div className="troom-section-label">ROOKIE DRAFT HISTORY</div>
              <RookieDraftBoard
                picks={ROOKIE_CLASSES[rookieSeason] ?? []}
                season={rookieSeason}
                seasons={ROOKIE_SEASONS}
                onSeason={setRookieSeason}
              />
            </section>

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

/* ═══════════ Rafters ═══════════ */
/**
 * The banner strip scrolls horizontally, and its scrollbar is hidden on
 * purpose — a scrollbar under the rafters ruins the effect. That's fine on
 * a phone, where you swipe. On a desktop with a mouse there was no swipe,
 * no scrollbar and no arrows, so the banners past the right edge were
 * simply unreachable.
 *
 * These arrows only exist when the strip actually overflows, and each one
 * hides at its end of the track, so a league with four banners sees exactly
 * what it saw before. They're real buttons, so keyboard and screen readers
 * get them too.
 */
function BannerRafters({ banners }) {
  const rowRef = useRef(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const sync = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    // 1px of slack: fractional widths mean scrollLeft rarely lands exactly
    // on the end, which would otherwise leave a dead arrow showing forever.
    const max = el.scrollWidth - el.clientWidth
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft < max - 1)
  }, [])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    // Overflow depends on the container width, so re-check on resize too —
    // a sidebar collapse changes this without any scroll event firing.
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [sync, banners.length])

  function nudge(dir) {
    const el = rowRef.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Roughly three banners a press — enough to feel like progress, little
    // enough that you never blow past the one you were looking for.
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.7, 220), behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <section className="troom-rafters">
      <div className="troom-rafter-beam" />
      <div className="troom-banner-row" ref={rowRef}>
        {banners.map((b) => (
          <div key={b.season} className="troom-banner" style={{ '--banner-color': b.color }}>
            <div className="troom-banner-year">{b.season}</div>
            <div className="troom-banner-team">{b.team.toUpperCase()}</div>
            <div className="troom-banner-label">CHAMPIONS</div>
          </div>
        ))}
      </div>
      {canLeft && (
        <button className="troom-rafter-arrow left" onClick={() => nudge(-1)} aria-label="Scroll to earlier championships">
          ‹
        </button>
      )}
      {canRight && (
        <button className="troom-rafter-arrow right" onClick={() => nudge(1)} aria-label="Scroll to later championships">
          ›
        </button>
      )}
    </section>
  )
}
