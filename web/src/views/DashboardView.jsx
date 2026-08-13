// DashboardView — full build lands in Phase 3.
export default function DashboardView({ setTab }) {
  return (
    <div>
      <header style={{ textAlign: 'center', padding: '24px 16px 8px' }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: '-2px',
            color: 'var(--iff-accent)',
            lineHeight: 1.05,
          }}
        >
          Insanity League
        </div>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6 }}>
          Fantasy Football League
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(158,168,184,0.5)',
            letterSpacing: 4,
            marginTop: 3,
          }}
        >
          EST. 2008
        </div>
      </header>
      <div className="empty-state">
        <div className="glyph">🏗️</div>
        <div className="title">Dashboard</div>
        <div>Team card, calendar &amp; trades arrive in Phase 3.</div>
      </div>
    </div>
  )
}
