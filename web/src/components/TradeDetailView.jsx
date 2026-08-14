// TradeDetailView — port of TradeDetailView in CodeRedApp.swift (v2: full
// negotiate loop). Both sides, status badge, accept/decline/counter for the
// receiving team, offer notes, counter chain history, and the ESPN execution
// checklist (players swap in ESPN; picks move only in this app).
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { formatTradeDate } from '../services/models'
import { DetailOverlay } from './shared'
import TradeProposalView from './TradeProposalView'

export const TRADE_STATUS_STYLE = {
  proposed:  { label: 'Proposed',  color: 'var(--iff-gold)', bg: 'rgba(244,162,97,0.15)' },
  accepted:  { label: 'Accepted',  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  rejected:  { label: 'Declined',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  countered: { label: 'Countered', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)' },
  completed: { label: 'Completed', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  historical:{ label: 'Historical',color: 'var(--iff-subtext)', bg: 'var(--iff-elevated)' },
}

export default function TradeDetailView({ trade, onClose }) {
  const { userTeam, respondToTrade, trades, userSettings } = useApp()
  const [responding, setResponding] = useState(false)
  const [localStatus, setLocalStatus] = useState(trade.status)
  const [showCounter, setShowCounter] = useState(false)

  const style = TRADE_STATUS_STYLE[localStatus] ?? TRADE_STATUS_STYLE.proposed
  const canRespond = localStatus === 'proposed' && trade.receivingTeamName === userTeam

  const proposerAssets = trade.assetsFromProposer?.length
    ? trade.assetsFromProposer
    : (trade.historicalProposerAssets ?? []).map((n) => ({ displayName: n, assetType: 'player' }))
  const receiverAssets = trade.assetsFromReceiver?.length
    ? trade.assetsFromReceiver
    : (trade.historicalReceiverAssets ?? []).map((n) => ({ displayName: n, assetType: 'player' }))

  // Counter chain — walk parentTradeId links back through the loaded trades
  const chain = useMemo(() => {
    const list = []
    let cur = trade
    while (cur?.parentTradeId) {
      const parent = trades.find((t) => t.id === cur.parentTradeId)
      if (!parent) break
      list.push(parent)
      cur = parent
    }
    return list
  }, [trade, trades])

  // ESPN split: players must be manually swapped in ESPN; picks exist only here
  const espnPlayers = [
    ...proposerAssets.filter((a) => a.assetType === 'player'),
    ...receiverAssets.filter((a) => a.assetType === 'player'),
  ]
  const appOnlyPicks = [
    ...proposerAssets.filter((a) => a.assetType === 'draftPick'),
    ...receiverAssets.filter((a) => a.assetType === 'draftPick'),
  ]

  async function respond(answer) {
    setResponding(true)
    try {
      await respondToTrade(trade.id, answer)
      setLocalStatus(answer === 'yes' ? 'accepted' : 'rejected')
      if (answer === 'yes' && (userSettings?.confetti ?? true)) {
        const { fireConfetti } = await import('../services/appearance')
        fireConfetti()
      }
    } finally {
      setResponding(false)
    }
  }

  if (showCounter) {
    return (
      <TradeProposalView
        counterOf={trade}
        onClose={() => {
          setShowCounter(false)
          onClose()
        }}
      />
    )
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
            {trade.parentTradeId ? ' · counter-offer' : ''}
          </div>
        </div>

        <SideCard title={`${trade.proposingTeamName} sends`} assets={proposerAssets.map((a) => a.displayName)} />
        <SideCard title={`${trade.receivingTeamName} sends`} assets={receiverAssets.map((a) => a.displayName)} />

        {trade.notes && (
          <div className="iff-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Note from {trade.proposingTeamName}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>“{trade.notes}”</div>
          </div>
        )}

        {/* Counter chain history */}
        {chain.length > 0 && (
          <div className="iff-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Negotiation History
            </div>
            {chain.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 12, borderTop: i > 0 ? '1px solid var(--iff-divider)' : 'none' }}>
                <span style={{ color: 'var(--iff-subtext)', flexShrink: 0 }}>{formatTradeDate(t.date)}</span>
                <span style={{ flex: 1, color: 'var(--iff-subtext)' }}>
                  <strong style={{ color: 'var(--iff-text)' }}>{t.proposingTeamName}</strong> offered{' '}
                  {(t.assetsFromProposer ?? []).map((a) => a.displayName).join(', ') || '—'}
                  {' for '}
                  {(t.assetsFromReceiver ?? []).map((a) => a.displayName).join(', ') || '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {canRespond && (
          <>
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
            <button
              className="btn-outline"
              style={{ borderColor: '#38BDF8', color: '#38BDF8' }}
              disabled={responding}
              onClick={() => setShowCounter(true)}
            >
              ⇄ Counter Offer
            </button>
          </>
        )}

        {/* ESPN execution checklist — shown once a deal is agreed */}
        {(localStatus === 'accepted' || localStatus === 'completed') && (
          <div className="iff-card" style={{ padding: 14, border: '1px solid rgba(244,162,97,0.35)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {localStatus === 'completed' ? 'Execution Summary' : 'Next Steps — Commissioner'}
            </div>
            {espnPlayers.length > 0 && (
              <div style={{ marginBottom: appOnlyPicks.length ? 10 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  🏈 Swap in ESPN {localStatus === 'completed' ? '(done)' : '(manual)'}
                </div>
                {espnPlayers.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--iff-subtext)', padding: '2px 0 2px 18px' }}>
                    ☐ {a.displayName}
                  </div>
                ))}
              </div>
            )}
            {appOnlyPicks.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📋 Picks — tracked in this app only</div>
                {appOnlyPicks.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--iff-subtext)', padding: '2px 0 2px 18px' }}>
                    • {a.displayName} <span style={{ opacity: 0.7 }}>(ESPN can't trade picks — no action there)</span>
                  </div>
                ))}
              </div>
            )}
            {localStatus === 'accepted' && (
              <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 10, lineHeight: 1.5 }}>
                Once the player swap is confirmed in ESPN, the commissioner executes this trade from
                Admin → Trades, which moves all assets here.
              </div>
            )}
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
