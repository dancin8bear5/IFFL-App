// LiveScoreboard — this week's matchups, straight from ESPN.
//
// Fed by espnLiveScores/{season}, written every 3 minutes during NFL game
// windows by the pollEspnScores function. Deliberately NOT the weeklyScores
// collection the league's season charts read: this is on trial, and a
// separate collection is what makes "only Jared sees it" a guarantee rather
// than a promise.
//
// Visibility is config/league.liveScores: 'off' | 'commissioner' | 'all'.
// Same three-state shape as the GroupMe delivery mode, and for the same
// reason — a rollout needs a middle setting where the thing runs for real
// with one person watching.
//
// FORM: a two-column matchup list, not a chart. Six rows of paired numbers
// is a scoreboard; the reader wants "who is winning right now", which is a
// comparison within each row, and any chart form would scatter that across
// an axis. The leading side is bolded — position and weight carry it, so
// nothing depends on color alone.
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as fs from '../services/firestoreService'
import { TeamAvatar } from './shared'

export default function LiveScoreboard() {
  const { activeSeason, userTeam, liveScoresMode, isAdmin, isPreview } = useApp()
  const [board, setBoard] = useState(null)

  const visible = liveScoresMode === 'all' || (liveScoresMode === 'commissioner' && isAdmin)

  useEffect(() => {
    if (!visible) return
    if (isPreview) {
      import('../data/previewData').then((d) => setBoard(d.previewLiveScores ?? null))
      return
    }
    return fs.listenToLiveScores(activeSeason, setBoard)
  }, [visible, isPreview, activeSeason])

  if (!visible || !board?.games?.length) return null

  const kickoff = board.games.every((g) => !g.final && !g.homeScore && !g.awayScore)

  return (
    <div className="iff-card" style={{ padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>
          Week {board.week} Scoreboard
        </div>
        {liveScoresMode === 'commissioner' && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--iff-gold)', letterSpacing: 0.5 }}>
            TEST — ONLY YOU
          </span>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginBottom: 10 }}>
        {kickoff ? 'Live from ESPN once games kick off' : 'Live from ESPN · updates every few minutes'}
      </div>

      <div role="list">
        {board.games.map((g, i) => {
          const homeUp = g.homeScore > g.awayScore
          const awayUp = g.awayScore > g.homeScore
          const mine = g.home === userTeam || g.away === userTeam
          return (
            <div
              key={g.matchupId ?? i}
              role="listitem"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
                background: mine ? 'rgba(255,255,255,0.045)' : 'transparent',
                borderBottom: i < board.games.length - 1 ? '1px solid var(--iff-divider)' : 'none',
              }}
            >
              <Side team={g.away} score={g.awayScore} leading={awayUp} mine={g.away === userTeam} />
              <span style={{ fontSize: 10, color: 'var(--iff-subtext)', flexShrink: 0 }}>
                {g.final ? 'FINAL' : '@'}
              </span>
              <Side team={g.home} score={g.homeScore} leading={homeUp} mine={g.home === userTeam} align="right" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Side({ team, score, leading, mine, align = 'left' }) {
  return (
    <span
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
      }}
    >
      <TeamAvatar name={team} size={18} />
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: leading ? 800 : 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textAlign: align,
          color: mine ? 'var(--iff-accent)' : 'var(--iff-text)',
        }}
      >
        {team ?? '—'}
      </span>
      <span
        className="tnum"
        style={{ fontSize: 12.5, fontWeight: leading ? 900 : 700, flexShrink: 0, color: leading ? 'var(--iff-text)' : 'var(--iff-subtext)' }}
      >
        {score == null ? '—' : Number(score).toFixed(1)}
      </span>
    </span>
  )
}
