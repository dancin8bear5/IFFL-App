// TransactionLedger — the league's paper trail. Every roster/money event
// (trade, drop, claim, clear, keep, adjust) in one filterable feed.
// Answers "who did I have in Week 6" and makes the 2-auction clock auditable.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { formatTradeDate } from '../services/models'
import { DetailOverlay, ChipScroller, TeamAvatar } from './shared'

const TYPE_META = {
  trade:  { glyph: '⇄',  label: 'Trade',   color: '#F97316' },
  drop:   { glyph: '↓',  label: 'Drop',    color: '#EF4444' },
  claim:  { glyph: '↑',  label: 'Claim',   color: '#38BDF8' },
  clear:  { glyph: '✓',  label: 'Cleared', color: '#9EA8B8' },
  keep:   { glyph: '🔒', label: 'Keep',    color: '#4ADE80' },
  adjust: { glyph: '✎',  label: 'Adjust',  color: '#A855F7' },
  tax:    { glyph: '💸', label: 'Tax',     color: '#E63946' },
}
const typeMeta = (t) => TYPE_META[t] ?? { glyph: '•', label: t, color: '#9EA8B8' }

export default function TransactionLedger({ onClose }) {
  const { transactions } = useApp()
  const [team, setTeam] = useState('All')

  const rows = useMemo(
    () => (team === 'All' ? transactions : transactions.filter((t) => t.teamName === team || t.fromTeam === team)),
    [transactions, team],
  )

  return (
    <DetailOverlay title="Transaction Log" onBack={onClose} desktop="wide">
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <ChipScroller>
          <div style={{ display: 'flex', gap: 8, width: 'max-content', paddingRight: 40 }}>
          {['All', ...fantasyTeams.map((t) => t.name)].map((name) => {
            const active = team === name
            return (
              <button
                key={name}
                onClick={() => setTeam(name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  borderRadius: 18, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  background: active ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: active ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {name !== 'All' && <TeamAvatar name={name} size={18} />}
                {name}
              </button>
            )
          })}
          </div>
        </ChipScroller>

        {rows.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="glyph">🧾</div>
            <div className="title">No transactions yet</div>
            <div>Trades, drops, claims and clears will show up here as they happen.</div>
          </div>
        ) : (
          <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((tx, i) => {
              const meta = typeMeta(tx.type)
              return (
                <div
                  key={tx.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                    borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 800, color: meta.color, background: `${meta.color}1E`,
                    }}
                  >
                    {meta.glyph}
                  </span>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.playerName ?? (tx.type === 'tax' ? 'TAX DAT ASS' : 'Unknown asset')}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 1 }}>
                      {tx.type === 'trade' && tx.fromTeam
                        ? `${tx.fromTeam} → ${tx.teamName}`
                        : tx.teamName}
                      {tx.week ? ` · Wk ${tx.week}` : ''}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </span>
                  </span>

                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: meta.color }}>
                      {meta.label.toUpperCase()}
                    </span>
                    <span className="tnum" style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2 }}>
                      {tx.price != null ? `$${tx.price} · ` : ''}{formatTradeDate(tx.createdAt)}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DetailOverlay>
  )
}
