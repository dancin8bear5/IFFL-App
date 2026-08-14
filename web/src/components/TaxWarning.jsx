// TaxWarning — the TAX DAT ASS guard. Shown wherever a trade could push a
// team's drafted/kept salary past the $300 luxury-tax threshold: the
// proposal builder, the offer detail, and the commissioner's execute button.
import { ROSTER_CAP, LUXURY_TAX_PER_TEAM, LUXURY_TAX_TOTAL } from '../data/staticData'

/**
 * impact = contracts.tradeCapImpact(...) result;
 * names = {proposer, receiver} team names for display.
 */
export default function TaxWarning({ impact, names }) {
  const sides = [
    { team: names.proposer, ...impact.proposer },
    { team: names.receiver, ...impact.receiver },
  ]
  const breaching = sides.filter((s) => s.after > ROSTER_CAP)
  if (breaching.length === 0) {
    // Quiet cap readout — always useful context on a money trade
    return (
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', padding: '0 4px' }}>
        Cap after trade: {sides.map((s) => `${s.team} $${s.after}`).join(' · ')} (threshold ${'$'}{ROSTER_CAP})
      </div>
    )
  }

  return (
    <div
      className="iff-card"
      style={{
        padding: 14,
        border: '1.5px solid rgba(230,57,70,0.6)',
        background: 'linear-gradient(135deg, rgba(230,57,70,0.16), var(--iff-surface) 65%)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--iff-accent)' }}>
        🚨 TAX DAT ASS — ${ROSTER_CAP} cap breached
      </div>
      {breaching.map((s) => (
        <div key={s.team} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <b>{s.team}</b> lands at <b className="tnum">${s.after}</b> in drafted/kept salary
          (was ${s.before}) — <b className="tnum">${s.after - ROSTER_CAP}</b> over.
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.55 }}>
        Crossing ${ROSTER_CAP} owes <b style={{ color: 'var(--iff-gold)' }}>${LUXURY_TAX_PER_TEAM} to every
        other team — ${LUXURY_TAX_TOTAL} total</b>, payable within 24 hours of execution. Unpaid, the
        trade voids and the team takes a 100-point penalty every week until settled.
      </div>
    </div>
  )
}
