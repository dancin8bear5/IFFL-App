// StandingsReel — the Dashboard's Standings card, animated (Oct 1, 2026).
//
// Replays the season when it first comes into view: kickoff → one beat per
// completed week (bars = running points-for, weekly high/low tagged) → the
// real ESPN table with the playoff cut → luck (all-play) → settles into the
// same table the Dashboard always had: place (medal colours), avatar, team
// link, belts, W-L, PF (green inside the cut), your row tinted, "Full
// history" link. Settled, it adds a weekly sparkline, luck and this week's
// game; tap a row (not the name — that's still the roster link) for detail.
//
// Why it plays instead of scrubbing on scroll: it sits at the very top of
// the Dashboard, so there is no scroll runway before it — a scroll-driven
// version would load half-finished. It plays once per session per new
// week (sessionStorage), tap skips, Replay and the week dots re-run it,
// and prefers-reduced-motion gets the settled table straight away.
import { useEffect, useMemo, useRef, useState } from 'react'
import { SectionHeader, TeamAvatar, BeltRow } from './shared'
import TeamLink from './TeamLink'
import { teamByName } from '../data/staticData'
import * as fs from '../services/firestoreService'
import {
  buildReel, liveGameFor, beats, rowAt, barAt, currentWeekIndex, clamp,
} from '../services/standingsReel'
import '../styles/standingsReel.css'

const RH = 34                 // row height, px
const MEDAL = ['var(--iff-gold)', '#B8B8C8', '#CD7F32']
const SPARK_WEEKS = 6
const fmt1 = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmt2 = (v) => v.toFixed(2)
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function StandingsReel({ season, standings, weeklyScores, userTeam, onOpenHistory, isPreview, previewBoard }) {
  const reel = useMemo(() => buildReel(standings, weeklyScores), [standings, weeklyScores])

  // This week's games — the same doc the (currently hidden) Live scoreboard reads.
  const [board, setBoard] = useState(null)
  useEffect(() => {
    if (isPreview) { setBoard(previewBoard ?? null); return }
    return fs.listenToLiveScores(season, setBoard, () => setBoard(null))
  }, [season, isPreview, previewBoard])

  // ── playback ──
  const weekCount = reel?.weeks.length ?? 0
  const playKey = `standingsReel.played.${season}.${reel?.gamesPlayed ?? 0}.${weekCount}`
  const alreadyPlayed = () => { try { return sessionStorage.getItem(playKey) === '1' } catch { return false } }
  const [p, setP] = useState(() => (reducedMotion() || alreadyPlayed() ? 1 : 0))
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const cardRef = useRef(null)
  const duration = clamp(4500 + weekCount * 300, 5000, 8500, )

  const play = (from = 0) => {
    if (reducedMotion()) { setP(1); return }
    cancelAnimationFrame(raf.current)
    const t0 = performance.now() - from * duration
    setPlaying(true)
    const step = (now) => {
      const v = clamp((now - t0) / duration)
      setP(v)
      if (v < 1) raf.current = requestAnimationFrame(step)
      else { setPlaying(false); try { sessionStorage.setItem(playKey, '1') } catch { /* private mode */ } }
    }
    raf.current = requestAnimationFrame(step)
  }
  const skip = () => { cancelAnimationFrame(raf.current); setPlaying(false); setP(1); try { sessionStorage.setItem(playKey, '1') } catch { /* */ } }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // Start the first time the card is properly on screen.
  useEffect(() => {
    if (!reel || p >= 1 || playing || !cardRef.current) return
    if (!('IntersectionObserver' in window)) { play(); return }
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { io.disconnect(); play() }
    }, { threshold: 0.35 })
    io.observe(cardRef.current)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel, playKey])

  // ── expanded row (settled only) ──
  const [open, setOpen] = useState(null)
  const xpRef = useRef(null)
  const [xpH, setXpH] = useState(0)
  useEffect(() => { setXpH(open && xpRef.current ? xpRef.current.offsetHeight : 0) }, [open, p, board])

  if (!reel) return null

  const b = beats(p, weekCount)
  const settled = p >= 1
  const wk = currentWeekIndex(b)
  const inRace = wk > 0 && b.standings < 0.5
  const last = reel.weeks.length - 1
  const place = Object.fromEntries(reel.table.map((s) => [s.teamName, s.place]))
  const sparkFrom = Math.max(0, reel.weeks.length - SPARK_WEEKS)
  const maxWeekly = Math.max(1, ...reel.teams.flatMap((t) => reel.points[t].filter((v) => v != null)))
  const liveWeek = board?.week && board.week > (reel.weeks.at(-1) ?? 0) ? board.week : null

  // ── HUD line ──
  let hudLeft = 'Kickoff', hudMsg = <>{reel.teams.length} teams · {reel.cutPlace} playoff spots</>
  if (inRace) {
    const i = wk - 1, { high, low } = reel.extremes[i]
    hudLeft = `Week ${reel.weeks[i]}${i > 0 ? ' · total' : ''}`
    hudMsg = high
      ? <>High <em>{high} {fmt2(reel.points[high][i])}</em>{low && low !== high && <> · Low {low} {fmt2(reel.points[low][i])}</>}</>
      : null
  } else if (b.standings >= 0.5 && (b.luck < 0.5 || !reel.luckValid)) {
    hudLeft = 'Standings'
    const lead = reel.table[0]
    const tiedTop = reel.table.filter((s) => s.record === lead.record).length
    hudMsg = reel.unbeaten.length === 1
      ? <><em>{reel.unbeaten[0]}</em> alone unbeaten at {lead.record}</>
      : <><em>{lead.teamName}</em> leads at {lead.record}{tiedTop > 1 ? ` · ${tiedTop} teams tied` : ''}</>
  } else if (b.luck >= 0.5 && reel.luckValid) {
    hudLeft = 'Luck'
    const lk = reel.teams.reduce((a, c) => (reel.luck[c] > reel.luck[a] ? c : a))
    const ul = reel.teams.reduce((a, c) => (reel.luck[c] < reel.luck[a] ? c : a))
    hudMsg = <>Luckiest <em>{lk} {signed(reel.luck[lk])}</em> · Unluckiest {ul} {signed(reel.luck[ul])}</>
  }

  const tagFor = (t) => {
    if (settled) return null
    if (inRace) {
      const { high, low } = reel.extremes[wk - 1]
      if (t === high) return ['hi', `WK ${reel.weeks[wk - 1]} HIGH`]
      if (t === low) return ['lo', `WK ${reel.weeks[wk - 1]} LOW`]
      return null
    }
    if (b.standings >= 0.5) {
      if (reel.unbeaten.length === 1 && reel.unbeaten[0] === t) return ['hi', 'UNBEATEN']
      if (place[t] === reel.cutPlace || place[t] === reel.cutPlace + 1) return ['bub', 'BUBBLE']
    }
    return null
  }

  const openPlace = open ? place[open] : null
  const cols = reel.luckValid ? 'sr-cols' : 'sr-cols sr-noluck'

  return (
    <div>
      <SectionHeader title={`${season} Standings`} actionLabel="Full history" onAction={onOpenHistory} />
      <div
        ref={cardRef}
        className="iff-card sr-card"
        style={{ marginTop: 10 }}
        onClick={(e) => { if (playing && !e.target.closest('a,button')) skip() }}
      >
        <div className="sr-hud" style={{ height: 42 * (1 - b.settle), opacity: 1 - b.settle }} aria-hidden={settled}>
          <span className="sr-hud-l">{hudLeft}</span>
          <span className="sr-hud-m">{hudMsg}</span>
          <span className="sr-dots">
            {reel.weeks.map((w, i) => (
              <button
                key={w} type="button" title={`Jump to week ${w}`} aria-label={`Jump to week ${w}`}
                className={wk > i || b.standings > 0 ? 'on' : ''}
                onClick={(e) => { e.stopPropagation(); play(0.08 + (0.58 * (i + 1)) / weekCount - 0.005) }}
              />
            ))}
          </span>
        </div>

        <div className={`sr-head ${cols}`}>
          <span style={{ opacity: b.standings }} />
          <span>Team</span>
          <span className="c-wl" style={{ opacity: b.standings }}>W-L</span>
          <span className="c-pf" style={{ opacity: b.settle }}>PF</span>
          <span className="c-sp sr-wide" style={{ opacity: b.settle }}>Wk {reel.weeks[sparkFrom] ?? ''}–{reel.weeks.at(-1) ?? ''}</span>
          {reel.luckValid && <span className="c-lk sr-wide" style={{ opacity: b.luck }}>Luck</span>}
          <span className="c-lv sr-wide" style={{ opacity: b.settle }}>{liveWeek ? `Week ${liveWeek}` : ''}</span>
        </div>

        <div className="sr-rows" style={{ height: reel.teams.length * RH + (settled ? xpH : 0) }}>
          <div
            className="sr-cut"
            style={{ top: reel.cutPlace * RH + (settled && openPlace && openPlace <= reel.cutPlace ? xpH : 0), transform: `scaleX(${b.standings})`, opacity: b.standings }}
            aria-hidden
          >
            {/* The labels make way for the settled table's right-hand columns; the line stays. */}
            <span style={{ opacity: 1 - b.settle }}>Playoffs</span><span className="b" style={{ opacity: 1 - b.settle }}>Chasing</span>
          </div>

          {reel.table.map((s) => {
            const t = s.teamName
            const inCut = s.place <= reel.cutPlace
            const y = rowAt(reel, t, b) * RH + (settled && openPlace && s.place > openPlace ? xpH : 0)
            const bar = barAt(reel, t, b)
            const leader = inRace && reel.frames[wk][t] === 0
            const tag = tagFor(t)
            const game = liveGameFor(board, t)
            const luck = reel.luck[t]
            return (
              <div
                key={t}
                className={`sr-row ${cols}${t === userTeam ? ' me' : ''}${settled ? ' tappable' : ''}${open === t ? ' open' : ''}`}
                style={{ transform: `translateY(${y}px)`, opacity: b.standings > 0 && !settled && !inCut ? 1 - 0.4 * b.standings : 1 }}
                onClick={(e) => { if (settled && !e.target.closest('a,button')) setOpen(open === t ? null : t) }}
                role={settled ? 'button' : undefined}
                aria-expanded={settled ? open === t : undefined}
                tabIndex={settled ? 0 : -1}
                onKeyDown={(e) => { if (settled && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) { e.preventDefault(); setOpen(open === t ? null : t) } }}
              >
                <span
                  className="sr-bar"
                  aria-hidden
                  style={{
                    width: `calc((100% - var(--sr-bar-reserve)) * ${(bar.value / bar.max).toFixed(4)})`,
                    opacity: (b.stages[0] > 0 ? 1 : 0) * (1 - b.settle),
                    background: leader ? 'color-mix(in srgb, var(--iff-gold) 34%, transparent)'
                      : b.standings > 0.5 && inCut ? 'color-mix(in srgb, var(--iff-green) 18%, transparent)'
                        : 'color-mix(in srgb, var(--iff-subtext) 14%, transparent)',
                  }}
                >
                  <b style={{ opacity: b.stages[0] > 0.02 ? 1 - b.standings : 0 }}>{fmt1(bar.value)}</b>
                </span>
                <span className="tnum sr-place" style={{ opacity: b.standings, color: s.place <= 3 ? MEDAL[s.place - 1] : 'var(--iff-subtext)' }}>{s.place}</span>
                <span className="sr-team">
                  <TeamAvatar name={t} size={20} />
                  <span className="sr-name" style={{ fontWeight: t === userTeam ? 700 : 400 }}><TeamLink name={t} /></span>
                  <BeltRow count={teamByName[t]?.beltWins ?? 0} size={8} />
                  {tag && <span className={`sr-tag ${tag[0]}`}>{tag[1]}</span>}
                </span>
                <span className="tnum c-wl" style={{ opacity: b.standings }}>{s.record ?? '—'}</span>
                <span className="tnum c-pf" style={{ opacity: b.settle, color: inCut ? 'var(--iff-green)' : 'var(--iff-subtext)' }}>
                  {s.pointsFor != null ? s.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                </span>
                <span className="c-sp sr-wide" style={{ opacity: b.settle }} aria-hidden>
                  {reel.points[t].slice(sparkFrom).map((v, k) => {
                    const i = sparkFrom + k, { high, low } = reel.extremes[i]
                    return <i key={i} style={{ height: v == null ? 2 : Math.round(4 + 16 * v / maxWeekly), background: t === high ? 'var(--iff-gold)' : t === low ? 'var(--iff-accent)' : 'var(--iff-subtext)' }} />
                  })}
                </span>
                {reel.luckValid && (
                  <span className="tnum c-lk sr-wide" style={{ opacity: b.luck, color: luck > 0.4 ? 'var(--iff-green)' : luck < -0.4 ? 'var(--iff-accent)' : 'var(--iff-subtext)' }}>
                    {signed(luck)}
                  </span>
                )}
                <span className="c-lv sr-wide" style={{ opacity: b.settle }}>
                  {game && liveWeek ? <>vs <b>{game.opponent}</b>{game.started || game.final ? <> · {fmt1(game.mine ?? 0)}–{fmt1(game.theirs ?? 0)}{game.final ? ' F' : ''}</> : ''}</> : ''}
                </span>
              </div>
            )
          })}

          {settled && open && (() => {
            const t = open, s = reel.table.find((x) => x.teamName === t), ap = reel.allPlay[t], game = liveGameFor(board, t)
            const opp = game && reel.table.find((x) => x.teamName === game.opponent)
            return (
              <div ref={xpRef} className="sr-xp" style={{ top: s.place * RH }}>
                <div><b>{t}</b> · {s.record} · {ordinal(s.place)} · {s.pointsFor != null ? fmt2(s.pointsFor) : '—'} PF</div>
                <div className="sr-xp-g">
                  {reel.weeks.slice(sparkFrom).map((w, k) => {
                    const v = reel.points[t][sparkFrom + k]
                    return <div key={w}><small>Week {w}</small><b>{v != null ? fmt2(v) : '—'}</b></div>
                  })}
                  {reel.weeks.length > 0 && <div><small>All-play</small><b>{ap.wins}-{ap.losses}{ap.ties ? `-${ap.ties}` : ''}</b>{reel.luckValid ? ` · luck ${signed(reel.luck[t])}` : ''}</div>}
                </div>
                {game && liveWeek && (
                  <div className="sr-xp-live">
                    Week {liveWeek}: vs <TeamLink name={game.opponent} />{opp ? ` (${opp.record}, ${ordinal(opp.place)})` : ''}
                    {game.started || game.final ? ` · ${fmt2(game.mine ?? 0)}–${fmt2(game.theirs ?? 0)}${game.final ? ' final' : ' live'}` : ' · not started'}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="sr-foot">
          {playing
            ? <button type="button" onClick={(e) => { e.stopPropagation(); skip() }}>Skip ›</button>
            : <>
                <span>{settled ? 'Tap a team for its weeks' : ''}</span>
                {weekCount > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(null); play(0) }}>↻ Replay season</button>}
              </>}
        </div>
      </div>
    </div>
  )
}
