// TradeProposalView — port of TradeProposalView + CounterOfferView in
// CodeRedApp.swift. Pick the other team, select assets from both sides,
// attach a note, send. With `counterOf`, opens pre-filled and swapped as a
// counter to that trade.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { DetailOverlay, PosBadge } from './shared'

export default function TradeProposalView({ onClose, counterOf = null }) {
  const {
    userTeam, allDisplayAssets, activeSeason, proposeTrade, counterTrade,
    selectedAssetForTrade, setSelectedAssetForTrade,
  } = useApp()

  const [otherTeam, setOtherTeam] = useState(
    counterOf?.proposingTeamName ?? selectedAssetForTrade?.teamName ?? '',
  )
  // Counter mode pre-fill: I keep what they asked of me on my side (editable),
  // and what they offered stays on their side (editable) — swapped perspective.
  const [mySelected, setMySelected] = useState(
    () => new Set((counterOf?.assetsFromReceiver ?? []).map((a) => a.assetId)),
  )
  const [theirSelected, setTheirSelected] = useState(
    () =>
      new Set(
        counterOf
          ? (counterOf.assetsFromProposer ?? []).map((a) => a.assetId)
          : selectedAssetForTrade
            ? [selectedAssetForTrade.id]
            : [],
      ),
  )
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const myAssets = useMemo(
    () => allDisplayAssets.filter((a) => a.teamName === userTeam).sort((a, b) => b.currentPrice - a.currentPrice),
    [allDisplayAssets, userTeam],
  )
  const theirAssets = useMemo(
    () => allDisplayAssets.filter((a) => a.teamName === otherTeam).sort((a, b) => b.currentPrice - a.currentPrice),
    [allDisplayAssets, otherTeam],
  )

  const toggle = (set, setter, id) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const toRef = (a) => ({
    assetType: a.assetType,
    assetId: a.id,
    displayName: a.name,
    teamName: a.teamName,
  })

  const canSend = otherTeam && mySelected.size > 0 && theirSelected.size > 0 && !sending

  async function send() {
    setSending(true)
    try {
      const trade = {
        season: activeSeason,
        proposingTeamName: userTeam,
        receivingTeamName: otherTeam,
        assetsFromProposer: myAssets.filter((a) => mySelected.has(a.id)).map(toRef),
        assetsFromReceiver: theirAssets.filter((a) => theirSelected.has(a.id)).map(toRef),
        notes: notes.trim() || null,
        isHistorical: false,
      }
      if (counterOf) await counterTrade(counterOf.id, trade)
      else await proposeTrade(trade)
      setSent(true)
      setSelectedAssetForTrade(null)
      setTimeout(onClose, 900)
    } finally {
      setSending(false)
    }
  }

  const sumOf = (assets, sel) => assets.filter((a) => sel.has(a.id)).reduce((s, a) => s + a.currentPrice, 0)

  return (
    <DetailOverlay title={counterOf ? 'Counter Offer' : 'Propose Trade'} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sent ? (
          <div className="empty-state">
            <div className="glyph">📨</div>
            <div className="title">{counterOf ? 'Counter Sent' : 'Trade Proposed'}</div>
            <div>{otherTeam} will see it in their Trades tab.</div>
          </div>
        ) : (
          <>
            {counterOf && (
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.5, padding: '0 2px' }}>
                Countering {counterOf.proposingTeamName}'s offer — their original terms are
                pre-selected below. Adjust either side, then send.
              </div>
            )}

            {/* Opponent picker (locked when countering) */}
            <div className="iff-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Trade With
              </div>
              {counterOf ? (
                <div style={{ fontSize: 15, fontWeight: 700 }}>{otherTeam}</div>
              ) : (
                <select value={otherTeam} onChange={(e) => { setOtherTeam(e.target.value); setTheirSelected(new Set()) }}>
                  <option value="">Select team…</option>
                  {fantasyTeams.filter((t) => t.name !== userTeam).map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* My side */}
            <AssetPickList
              title={`You Send (${userTeam})`}
              assets={myAssets}
              selected={mySelected}
              onToggle={(id) => toggle(mySelected, setMySelected, id)}
              total={sumOf(myAssets, mySelected)}
            />

            {/* Their side */}
            {otherTeam && (
              <AssetPickList
                title={`You Receive (${otherTeam})`}
                assets={theirAssets}
                selected={theirSelected}
                onToggle={(id) => toggle(theirSelected, setTheirSelected, id)}
                total={sumOf(theirAssets, theirSelected)}
              />
            )}

            {/* Note to the other manager */}
            <div className="iff-card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Add a Note (optional)
              </div>
              <textarea
                rows={2}
                placeholder="e.g. Open to swapping the pick for a later round…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            <button className="btn-primary" disabled={!canSend} onClick={send}>
              {sending ? 'Sending…' : counterOf ? 'Send Counter Offer' : 'Propose Trade'}
            </button>
          </>
        )}
      </div>
    </DetailOverlay>
  )
}

function AssetPickList({ title, assets, selected, onToggle, total }) {
  return (
    <div className="iff-card" style={{ padding: '12px 0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 14px 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </span>
        {total > 0 && <span className="tnum gold" style={{ fontSize: 12, fontWeight: 700 }}>${total}</span>}
      </div>
      <div style={{ maxHeight: 218, overflowY: 'auto' }}>
        {assets.map((a) => {
          const on = selected.has(a.id)
          return (
            <button
              key={a.id}
              onClick={() => onToggle(a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 14px', borderTop: '1px solid var(--iff-divider)',
                background: on ? 'rgba(230,57,70,0.08)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 15, color: on ? 'var(--iff-accent)' : 'var(--iff-subtext)', width: 20 }}>
                {on ? '☑' : '☐'}
              </span>
              <PosBadge position={a.position} />
              <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
              <span className="tnum green" style={{ fontSize: 13, fontWeight: 700 }}>${a.currentPrice}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
