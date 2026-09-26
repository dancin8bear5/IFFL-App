// FMKSwiperCard — port of Views/FMKSwiperView.swift.
// Card deck rated with drag gestures (left=Kill, right=Fuck, up=Marry) or
// the three buttons. Unrated assets surface first; progress bar tracks the deck.
import { useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'

const SWIPE_THRESHOLD = 90

export default function FMKSwiperCard() {
  const { allDisplayAssets, userTeam, fmkSignals, setFMKSignal, activeSeason } = useApp()
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [flyout, setFlyout] = useState(null) // {x, y} exit vector during animation
  const startRef = useRef(null)

  const ratedIds = useMemo(() => new Set(fmkSignals.map((s) => s.assetId)), [fmkSignals])

  // Deck = other teams' assets, unrated first (mirrors iOS ordering)
  const deck = useMemo(() => {
    const others = allDisplayAssets.filter((a) => a.teamName !== userTeam)
    const unrated = others.filter((a) => !ratedIds.has(a.assetId))
    const rated = others.filter((a) => ratedIds.has(a.assetId))
    return [...unrated, ...rated]
  }, [allDisplayAssets, userTeam, ratedIds])

  const total = deck.length
  const ratedCount = deck.filter((a) => ratedIds.has(a.assetId)).length
  const card = deck[0]
  const allRated = total > 0 && ratedCount === total

  function commit(signal) {
    if (!card) return
    const exit = signal === 'kill' ? { x: -420, y: 0 } : signal === 'fuck' ? { x: 420, y: 0 } : { x: 0, y: -560 }
    setFlyout(exit)
    setTimeout(() => {
      setFMKSignal(card, signal)
      setFlyout(null)
      setDrag({ x: 0, y: 0, active: false })
    }, 220)
  }

  function onPointerDown(e) {
    startRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0, active: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!startRef.current) return
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true })
  }

  function onPointerUp() {
    if (!startRef.current) return
    const { x, y } = drag
    startRef.current = null
    if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) commit('marry')
    else if (x > SWIPE_THRESHOLD) commit('fuck')
    else if (x < -SWIPE_THRESHOLD) commit('kill')
    else setDrag({ x: 0, y: 0, active: false }) // snap back
  }

  if (!card) {
    return (
      <div className="empty-state">
        <div className="glyph">🃏</div>
        <div className="title">No players to rate</div>
        <div>Waiting for league data…</div>
      </div>
    )
  }

  if (allRated && !flyout) {
    return (
      <div className="empty-state">
        <div className="glyph">✅</div>
        <div className="title">All Rated</div>
        <div>You've rated every asset in the league. Matches update as others rate.</div>
      </div>
    )
  }

  const existing = fmkSignals.find((s) => s.assetId === card.assetId)?.signal
  const pos = flyout ?? drag
  const rot = pos.x / 22
  const hint =
    pos.y < -40 && Math.abs(pos.y) > Math.abs(pos.x) ? 'marry' : pos.x > 40 ? 'fuck' : pos.x < -40 ? 'kill' : null

  const initials = card.isPick
    ? `R${card.rookieRound ?? '?'}`
    : card.name.split(' ').map((w) => w[0]).join('').slice(0, 2)

  return (
    <div className="fmk-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '14px 14px 0' }}>
      {/* Progress */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--iff-elevated)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${total ? (ratedCount / total) * 100 : 0}%`, height: '100%', background: 'var(--iff-accent)', transition: 'width 0.3s' }} />
        </div>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--iff-subtext)', fontWeight: 600 }}>
          {ratedCount}/{total}
        </span>
      </div>

      {/* Card */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 20,
          background: 'var(--iff-surface)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: 'grab',
          userSelect: 'none',
          transform: `translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg)`,
          transition: drag.active && !flyout ? 'none' : 'transform 0.22s ease-out',
          position: 'relative',
        }}
      >
        {/* Swipe hint stamps */}
        {hint && (
          <div
            style={{
              position: 'absolute', top: 14, left: hint === 'kill' ? 'auto' : 14, right: hint === 'kill' ? 14 : 'auto',
              zIndex: 2, fontSize: 22, fontWeight: 900, letterSpacing: 1, padding: '4px 12px', borderRadius: 8,
              transform: `rotate(${hint === 'kill' ? 12 : -12}deg)`,
              color: hint === 'kill' ? '#EF4444' : hint === 'fuck' ? 'var(--iff-gold)' : '#22C55E',
              border: `3px solid ${hint === 'kill' ? '#EF4444' : hint === 'fuck' ? 'var(--iff-gold)' : '#22C55E'}`,
            }}
          >
            {hint.toUpperCase()}
          </div>
        )}

        <div style={{ height: 160, background: 'linear-gradient(160deg, var(--iff-elevated) 0%, var(--iff-bg) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 68, height: 68, background: 'var(--iff-elevated)', borderRadius: '50%', border: '2px solid rgba(230,57,70,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: 'var(--iff-accent)' }}>
            {initials}
          </div>
          {card.nflTeam && <div style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{card.nflTeam}</div>}
        </div>

        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>{card.name}</div>
          <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 3 }}>
            {card.isPick ? 'Draft Pick' : card.position} · {card.teamName}'s Roster
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {[activeSeason, activeSeason + 1, activeSeason + 2].map((yr) => (
              <span key={yr} className="tnum" style={{ background: 'var(--iff-elevated)', borderRadius: 8, padding: '4px 10px', fontSize: 11 }}>
                {yr} <strong style={{ color: 'var(--iff-gold)' }}>${card.prices?.[String(yr)] ?? 0}</strong>
              </span>
            ))}
          </div>
          {existing && (
            <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 8 }}>
              Currently rated: <strong style={{ color: 'var(--iff-text)' }}>{existing}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <SwipeButton label="Kill" glyph="💀" color="#EF4444" onClick={() => commit('kill')} />
        <SwipeButton label="Fuck" glyph="🔥" color="#F4A261" big onClick={() => commit('fuck')} />
        <SwipeButton label="Marry" glyph="💍" color="#22C55E" onClick={() => commit('marry')} />
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--iff-subtext)', paddingBottom: 8 }}>
        <span><span className="gold">←</span> Kill</span>
        <span><span className="gold">↑</span> Marry</span>
        <span><span className="gold">→</span> Fuck</span>
      </div>
    </div>
  )
}

function SwipeButton({ label, glyph, color, big, onClick }) {
  const size = big ? 72 : 60
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `${color}26`, color, border: `1.5px solid ${color}55`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        fontSize: 11, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      }}
    >
      <span style={{ fontSize: big ? 26 : 20, lineHeight: 1 }}>{glyph}</span>
      {label}
    </button>
  )
}
