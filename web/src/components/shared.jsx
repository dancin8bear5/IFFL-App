// Shared UI pieces used across tabs.
import { teamByName } from '../data/staticData'

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

/** Full-screen pushed detail — the web stand-in for a NavigationLink push. */
export function DetailOverlay({ title, onBack, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'var(--iff-bg)',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 560,
        margin: '0 auto',
      }}
    >
      <div className="nav-bar">
        <div className="nav-side">
          <button className="icon-btn accent" onClick={onBack} style={{ fontSize: 15, fontWeight: 600 }}>
            ‹ Back
          </button>
        </div>
        <div className="nav-title">{title}</div>
        <div className="nav-side right" />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>{children}</div>
    </div>
  )
}
