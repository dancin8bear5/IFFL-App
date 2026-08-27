// PlayoffBracket — the league's bracket, readable by everyone.
//
// Two rules make this worth its own screen rather than a table of pairings:
//
//   THE DRAFT. Top seeds pick their own first-round opponent, in seed
//   order. So the bracket is genuinely unknown until the picks are in,
//   and a matchup that hasn't been chosen yet is shown as an open slot
//   with who's still on the board — that waiting IS the event.
//
//   THE SEEDING BONUS. The better regular-season record starts the game
//   with points already on the board. It's shown as a badge on the
//   matchup because it changes how you read the game before it's played.
//
// Commissioner controls live in Admin → League → Standings; this is the
// read side.
import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import {
  computeSeeds, buildRoundOne, buildNextRound, nextChooser,
  availableOpponents, roundLabel, choosingSeeds,
} from '../services/playoffs'
import { weeksFromMap, teamAverages } from '../services/weeklyStats'
import { PLAYOFF_TEAMS } from '../data/staticData'
import { TeamAvatar } from './shared'
import TeamLink from './TeamLink'

const rec = (t) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`

/**
 * Season points-for totals, used only as the seeding tiebreak.
 * Derived from the weekly scores rather than stored separately, so it
 * can't drift out of sync with them.
 */
function pointsForFrom(weeklyScores) {
  const totals = {}
  for (const t of teamAverages(weeksFromMap(weeklyScores))) totals[t.teamName] = t.total
  return totals
}

export default function PlayoffBracket() {
  const { weeklyScores, weeklyRecords, playoffs, userTeam, activeSeason } = useApp()

  const seeds = useMemo(
    () => computeSeeds(weeklyRecords, pointsForFrom(weeklyScores)),
    [weeklyRecords, weeklyScores],
  )
  const selections = playoffs?.selections ?? {}
  const winners = playoffs?.winners ?? {}

  const rounds = useMemo(() => {
    if (seeds.length < PLAYOFF_TEAMS) return []
    const r1 = buildRoundOne(seeds, selections)
    const out = [{ key: '1', label: roundLabel(seeds.length), games: r1 }]

    // Each round only appears once the one before it is fully decided —
    // buildNextRound returns [] for a half-finished round, so an
    // in-progress bracket simply stops rather than showing phantom games.
    let prevGames = r1.length
    for (const key of ['1', '2']) {
      const games = buildNextRound(seeds, winners[key] ?? [], prevGames)
      if (games.length === 0) break
      out.push({ key: String(Number(key) + 1), label: roundLabel(games.length * 2), games })
      prevGames = games.length
    }
    return out
  }, [seeds, selections, winners])

  if (Object.keys(weeklyRecords ?? {}).length === 0) {
    return (
      <div className="iff-card empty-state" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🏆 Playoff Bracket</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
          Standings for {activeSeason} haven&apos;t been entered yet. Once they are, the top{' '}
          {PLAYOFF_TEAMS} seed here and the opponent draft opens.
        </div>
      </div>
    )
  }

  if (seeds.length < PLAYOFF_TEAMS) {
    return (
      <div className="iff-card empty-state" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🏆 Playoff Bracket</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
          {seeds.length} of {PLAYOFF_TEAMS} teams have records entered. The bracket appears once
          the full field is in.
        </div>
      </div>
    )
  }

  const onTheClock = nextChooser(seeds, selections)
  const onBoard = availableOpponents(seeds, selections)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onTheClock && (
        <div className="iff-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <TeamAvatar name={onTheClock.teamName} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              <TeamLink name={onTheClock.teamName} /> is on the clock
              {onTheClock.teamName === userTeam && (
                <span style={{ color: 'var(--iff-gold)', marginLeft: 6 }}>— that&apos;s you</span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2 }}>
              Seed {onTheClock.seed} picks from {onBoard.map((s) => s.teamName).join(', ')}
            </div>
          </div>
        </div>
      )}

      {rounds.map((round) => (
        <div key={round.key} className="iff-card" style={{ padding: '14px 16px 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>{round.label}</div>
          <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2, marginBottom: 10 }}>
            Week {14 + Number(round.key)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {round.games.map((g, i) => (
              <Matchup key={`${round.key}-${i}`} game={g} userTeam={userTeam}
                won={winners[round.key] ?? []} chooses={choosingSeeds().includes(g.high.seed)} />
            ))}
          </div>
        </div>
      ))}

      <SeedList seeds={seeds} userTeam={userTeam} />
    </div>
  )
}

function Matchup({ game, userTeam, won, chooses }) {
  const { high, low, bonus } = game
  return (
    <div style={{
      border: '1px solid var(--iff-divider)', borderRadius: 10, padding: '9px 11px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <Side team={high} userTeam={userTeam} bonus={bonus} advanced={won.includes(high.teamName)} />
      {low ? (
        <Side team={low} userTeam={userTeam} bonus={bonus} advanced={won.includes(low.teamName)} />
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', fontStyle: 'italic', paddingLeft: 2 }}>
          {chooses
            ? `waiting on seed ${high.seed}'s pick`
            : 'gets whoever is left over'}
        </div>
      )}
    </div>
  )
}

function Side({ team, userTeam, bonus, advanced }) {
  const isMine = team.teamName === userTeam
  const gets = bonus?.teamName === team.teamName ? bonus.points : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 15, fontSize: 10, color: 'var(--iff-subtext)', flexShrink: 0 }}>{team.seed}</span>
      <TeamAvatar name={team.teamName} size={20} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isMine || advanced ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <TeamLink name={team.teamName} />
        {advanced && <span style={{ color: '#22C55E', marginLeft: 6, fontSize: 11 }}>✓</span>}
      </span>
      {gets > 0 && (
        // The head start is part of reading the matchup, so it sits on the
        // team that gets it rather than in a footnote.
        <span title={`${gets} point head start from a better regular-season record`}
          style={{
            fontSize: 10, fontWeight: 800, color: 'var(--iff-gold)',
            background: 'rgba(244,162,97,0.14)', borderRadius: 5, padding: '2px 6px', flexShrink: 0,
          }}>
          +{gets % 1 === 0 ? gets : gets.toFixed(1)}
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--iff-subtext)', width: 44, textAlign: 'right', flexShrink: 0 }}>
        {rec(team)}
      </span>
    </div>
  )
}

function SeedList({ seeds, userTeam }) {
  return (
    <div className="iff-card" style={{ padding: '14px 16px 12px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Seeds</div>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2, marginBottom: 10 }}>
        Record first, total points break ties
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {seeds.map((s) => (
          <div key={s.teamName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 15, fontSize: 10, color: 'var(--iff-subtext)', flexShrink: 0 }}>{s.seed}</span>
            <TeamAvatar name={s.teamName} size={20} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: s.teamName === userTeam ? 800 : 600 }}>
              <TeamLink name={s.teamName} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, width: 48, textAlign: 'right' }}>{rec(s)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', width: 56, textAlign: 'right' }}>
              {Math.round(s.pointsFor)} pts
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
