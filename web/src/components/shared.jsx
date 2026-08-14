// Shared UI pieces used across tabs.
import { useEffect, useRef, useState } from 'react'
import { teamByName } from '../data/staticData'

/**
 * Horizontally scrollable chip row with an arrow affordance when content
 * overflows — so off-screen chips are discoverable. Arrow scrolls onward;
 * it hides at the end of the row.
 */
export function ChipScroller({ children }) {
  const scrollRef = useRef(null)
  const [canScroll, setCanScroll] = useState(false)

  const update = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScroll(el.scrollWidth - el.clientWidth - el.scrollLeft > 8)
  }

  useEffect(() => {
    update()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={scrollRef}
        onScroll={update}
        style={{ overflowX: 'auto', scrollbarWidth: 'none', scrollBehavior: 'smooth' }}
      >
        {children}
      </div>
      {canScroll && (
        <button
          aria-label="Scroll for more"
          onClick={() => scrollRef.current?.scrollBy({ left: 220 })}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 4,
            background: 'linear-gradient(90deg, transparent, var(--iff-bg) 70%)',
            color: 'var(--iff-accent)',
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          ›
        </button>
      )}
    </div>
  )
}

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt}
          className={opt === value ? 'active' : ''}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export function TeamAvatar({ name, size = 36 }) {
  const team = teamByName[name]
  if (team?.logo) {
    return (
      <img
        src={team.logo}
        alt={`${name} logo`}
        width={size}
        height={size}
        loading="lazy"
        style={{
          width: size,
          height: size,
          borderRadius: '22%',
          objectFit: 'cover',
          flexShrink: 0,
          background: team.color,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
    )
  }
  // Former members / unknown names: colored initials fallback
  const initials = name
    .replace('.', '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: team?.color ?? 'var(--iff-elevated)',
        color: '#fff',
        fontWeight: 900,
        fontSize: size * 0.36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

export function BeltRow({ count, size = 10 }) {
  if (!count) return null
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ fontSize: size }}>
          🏆
        </span>
      ))}
    </span>
  )
}

export function PosBadge({ position }) {
  const isPick = position === 'Draft Pick'
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--iff-accent)',
        width: 34,
        flexShrink: 0,
        letterSpacing: 0.3,
      }}
    >
      {isPick ? 'PICK' : position}
    </span>
  )
}

export function LoadingList({ count = 5 }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton-block" style={{ width: 44, height: 44 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton-block" style={{ height: 14, width: '80%' }} />
            <div className="skeleton-block" style={{ height: 11, width: 130 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Pushed detail view. Mobile: full-screen takeover (NavigationLink push).
 * Desktop (≥900px): `desktop` prop picks the container —
 *   'modal' (default) centered card · 'panel' right-side drawer · 'wide' large modal.
 */
export function DetailOverlay({ title, onBack, children, desktop = 'modal' }) {
  return (
    <div className={`overlay-root overlay-${desktop}`} data-overlay>
      <div className="overlay-backdrop" onClick={onBack} />
      <div className="overlay-container">
        <div className="nav-bar overlay-navbar">
          <div className="nav-side">
            <button className="icon-btn accent" onClick={onBack} style={{ fontSize: 15, fontWeight: 600 }}>
              ‹ Back
            </button>
          </div>
          <div className="nav-title">{title}</div>
          <div className="nav-side right" />
        </div>
        <div className="overlay-scroll">{children}</div>
      </div>
    </div>
  )
}
