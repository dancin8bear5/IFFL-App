// TradeDetailView — port of TradeDetailView in CodeRedApp.swift.
// Both sides of the trade, status badge, accept/decline for the receiving team.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { formatTradeDate } from '../services/models'
import { DetailOverlay } from './shared'

const STATUS_STYLE = {
  proposed:  { label: 'Proposed',  color: 'var(--iff-gold)', bg: 'rgba(244,162,97,0.15)' },
  accepted:  { label: 'Accepted',  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected:  { label: 'Declined',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  completed: { label: 'Completed', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  historical:{ label: 'Historical',color: 'var(--iff-subtext)', bg: 'var(--iff-elevated)' },
}

export default function TradeDetailView({ trade, onClose }) {
  const { userTeam, respondToTrade } = useApp()
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState(trade.status)

  const style = STATUS_STYLE[localStatus] ?? STATUS_STYLE.proposed
  const canRespond = localStatus === 'proposed' && trade.receivingTeamName === userTeam

  const proposerAssets = trade.assetsFromProposer?.length
    ? trade.assetsFromProposer.map((a) => a.displayName)
    : trade.historicalProposerAssets ?? []
  const receiverAssets = trade.assetsFromReceiver?.length
    ? trade.assetsFromReceiver.map((a) => a.displayName)
    : trade.historicalReceiverAssets ?? []

  async function respond(answer) {
    setResponding(true)
    try {
      await respondToTrade(trade.id, answer)
      setLocalStatus(answer === 'yes' ? 'accepted' : 'rejected')
    } finally {
      setResponding(false)
    }
  }

  return (
    <DetailOverlay title="Trade" onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="iff-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {trade.proposingTeamName} ↔ {trade.receivingTeamName}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: style.color, background: style.bg, padding: '3px 9px', borderRadius: 6 }}>
              {style.label}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 4 }}>
            {formatTradeDate(trade.date)} · Season {trade.season}
          </div>
        </div>

        <SideCard title={`${trade.proposingTeamName} sends`} assets={proposerAssets} />
        <SideCard title={`${trade.receivingTeamName} sends`} assets={receiverAssets} />

        {trade.notes && (
          <div className="iff-card" style={{ padding: 14, fontSize: 13, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
            {trade.notes}
          </div>
        )}

        {canRespond && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button
              className="btn-outline"
              style={{ borderColor: '#EF4444', color: '#EF4444' }}
              disabled={responding}
              onClick={() => respond('no')}
            >
              Decline
            </button>
            <button className="btn-primary" style={{ background: '#16A34A' }} disabled={responding} onClick={() => respond('yes')}>
              Accept
            </button>
          </div>
        )}

        {localStatus === 'accepted' && (
          <div style={{ fontSize: 12, color: 'var(--iff-subtext)', textAlign: 'center', lineHeight: 1.6 }}>
            Accepted — the commissioner executes the trade once it's confirmed in ESPN.
          </div>
        )}
      </div>
    </DetailOverlay>
  )
}

function SideCard({ title, assets }) {
  return (
    <div className="iff-card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </div>
      {assets.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--iff-subtext)' }}>Nothing</div>
      ) : (
        assets.map((name, i) => (
          <div key={i} style={{ fontSize: 14, padding: '3px 0' }}>• {name}</div>
        ))
      )}
    </div>
  )
}
