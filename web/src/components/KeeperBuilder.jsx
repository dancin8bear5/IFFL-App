// KeeperBuilder — the Team Builder worksheet from MYTeam_Builder.xlsx as an
// app feature. Sandbox keeper planning across 3 seasons:
//   · your roster pre-loaded, any league player addable (your team lists first)
//   · tap a year cell to keep/X-out a player for that season
//   · placeholder budget slots ("RB4 — $3") for future auction buys
//   · live math per year: keeper cost, auction $ left (of $200), roster
//     count (of 19), $300 cap warning
//   · save/load named prototypes ("QB Heavy", "Zero RB") — ALWAYS private
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { AUCTION_BUDGET, ROSTER_CAP, ROSTER_SIZE, fantasyTeams } from '../data/staticData'
import * as fs from '../services/firestoreService'

const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'Draft Pick']
const YEARS = [0, 1, 2]

const newPlaceholderId = () => `ph-${Math.random().toString(36).slice(2, 9)}`

export default function KeeperBuilder() {
  const { user, userTeam, allDisplayAssets, activeSeason } = useApp()
  const uid = user?.uid ?? (DEV_PREVIEW ? 'preview-user' : null)

  const [plans, setPlans] = useState([])            // saved plan summaries
  const [planId, setPlanId] = useState(null)        // current plan doc id
  const [name, setName] = useState('My Plan')
  const [strategy, setStrategy] = useState('')
  const [entries, setEntries] = useState([])        // [{assetId, keep:{0,1,2}}]
  const [placeholders, setPlaceholders] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [phForm, setPhForm] = useState(null)        // {label, position, p0, p1, p2}

  const assetById = useMemo(() => {
    const m = {}
    for (const a of allDisplayAssets) m[a.id] = a
    return m
  }, [allDisplayAssets])

  const priceFor = (asset, yr) => asset?.prices?.[String(activeSeason + yr)] ?? 0

  // ── Load saved plans once ──────────────────────────────────
  useEffect(() => {
    if (!uid || DEV_PREVIEW) return
    fs.fetchKeeperPlans(uid).then(setPlans).catch(() => {})
  }, [uid])

  // ── Start from my roster ───────────────────────────────────
  function freshFromRoster() {
    const mine = allDisplayAssets.filter((a) => a.teamName === userTeam)
    setEntries(
      mine.map((a) => ({
        assetId: a.id,
        keep: { 0: priceFor(a, 0) > 0, 1: false, 2: false },
      })),
    )
    setPlaceholders([])
    setPlanId(null)
    setName('My Plan')
    setStrategy('')
    setSavedAt(null)
    setDirty(false)
  }

  // initialize once roster data is available
  useEffect(() => {
    if (entries.length === 0 && !planId && allDisplayAssets.length > 0 && userTeam) {
      freshFromRoster()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDisplayAssets.length, userTeam])

  function loadPlan(p) {
    setPlanId(p.id)
    setName(p.name ?? 'Plan')
    setStrategy(p.strategy ?? '')
    setEntries((p.entries ?? []).filter((e) => assetById[e.assetId]))
    setPlaceholders(p.placeholders ?? [])
    setSavedAt(Date.now())
    setDirty(false)
  }

  async function save() {
    if (!uid) return
    setSaving(true)
    try {
      const plan = { id: planId, ownerUid: uid, name: name.trim() || 'Plan', strategy, entries, placeholders }
      if (DEV_PREVIEW) {
        const id = planId ?? `preview-plan-${plans.length}`
        setPlanId(id)
        setPlans((prev) => [{ ...plan, id }, ...prev.filter((x) => x.id !== id)])
      } else {
        const id = await fs.saveKeeperPlan(plan)
        setPlanId(id)
        fs.fetchKeeperPlans(uid).then(setPlans).catch(() => {})
      }
      setSavedAt(Date.now())
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function removePlan() {
    if (!planId) return
    if (!DEV_PREVIEW) await fs.deleteKeeperPlan(planId).catch(() => {})
    setPlans((prev) => prev.filter((p) => p.id !== planId))
    freshFromRoster()
  }

  // ── Mutations ──────────────────────────────────────────────
  const touch = () => { setDirty(true); setSavedAt(null) }

  function toggleKeep(assetId, yr) {
    setEntries((prev) =>
      prev.map((e) => (e.assetId === assetId ? { ...e, keep: { ...e.keep, [yr]: !e.keep[yr] } } : e)),
    )
    touch()
  }

  function removeEntry(assetId) {
    setEntries((prev) => prev.filter((e) => e.assetId !== assetId))
    touch()
  }

  function addAsset(assetId) {
    if (!assetId || entries.some((e) => e.assetId === assetId)) return
    setEntries((prev) => [...prev, { assetId, keep: { 0: true, 1: false, 2: false } }])
    touch()
  }

  function addPlaceholder() {
    const p = phForm
    if (!p?.label?.trim()) return
    setPlaceholders((prev) => [
      ...prev,
      {
        id: newPlaceholderId(),
        label: p.label.trim(),
        position: p.position ?? 'RB',
        prices: { 0: Number(p.p0) || 0, 1: Number(p.p1) || 0, 2: Number(p.p2) || 0 },
      },
    ])
    setPhForm(null)
    touch()
  }

  // ── Math ───────────────────────────────────────────────────
  const totals = useMemo(() => {
    return YEARS.map((yr) => {
      let cost = 0
      let count = 0
      for (const e of entries) {
        const a = assetById[e.assetId]
        if (!a || !e.keep[yr]) continue
        cost += priceFor(a, yr)
        count += 1
      }
      for (const ph of placeholders) {
        const p = ph.prices?.[yr] ?? 0
        if (p > 0) { cost += p; count += 1 }
      }
      return { cost, count, left: AUCTION_BUDGET - cost, overCap: cost > ROSTER_CAP }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, placeholders, assetById, activeSeason])

  // ── Grouped rows ───────────────────────────────────────────
  const grouped = useMemo(() => {
    const rows = entries
      .map((e) => ({ ...e, asset: assetById[e.assetId] }))
      .filter((e) => e.asset)
    const byPos = {}
    for (const r of rows) {
      const pos = POS_ORDER.includes(r.asset.position) ? r.asset.position : 'Other'
      ;(byPos[pos] ??= []).push(r)
    }
    for (const pos of Object.keys(byPos)) {
      byPos[pos].sort((a, b) => priceFor(b.asset, 0) - priceFor(a.asset, 0))
    }
    return byPos
  }, [entries, assetById])

  // Add-player dropdown: my team first, then others, excluding already-added
  const addable = useMemo(() => {
    const inPlan = new Set(entries.map((e) => e.assetId))
    const rest = allDisplayAssets.filter((a) => !inPlan.has(a.id))
    const mine = rest.filter((a) => a.teamName === userTeam)
    const others = rest.filter((a) => a.teamName !== userTeam)
    const byTeam = {}
    for (const a of others) (byTeam[a.teamName] ??= []).push(a)
    return { mine, byTeam }
  }, [allDisplayAssets, entries, userTeam])

  if (!userTeam) {
    return (
      <div className="empty-state">
        <div className="glyph">🧪</div>
        <div className="title">Builder needs a team</div>
        <div>Sign in and get assigned a team to start planning.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Plan bar ── */}
      <div className="iff-card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select
          value={planId ?? ''}
          onChange={(e) => {
            const p = plans.find((x) => x.id === e.target.value)
            if (p) loadPlan(p)
          }}
          style={{ width: 'auto', minWidth: 140, flex: '0 1 auto' }}
        >
          <option value="">— saved prototypes —</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); touch() }}
          placeholder='Plan name — "QB Heavy", "Zero RB"…'
          style={{ flex: '1 1 160px', minWidth: 140 }}
        />
        <button className="btn-outline" onClick={freshFromRoster} style={{ fontSize: 11, padding: '6px 12px' }}>
          ＋ New
        </button>
        <button className="btn-primary" onClick={save} disabled={saving} style={{ fontSize: 12, padding: '8px 18px' }}>
          {saving ? 'Saving…' : savedAt && !dirty ? 'Saved ✓' : 'Save'}
        </button>
        {planId && (
          <button onClick={removePlan} aria-label="Delete plan" style={{ color: '#EF4444', fontSize: 14, padding: 4 }}>🗑</button>
        )}
        <input
          type="text"
          value={strategy}
          onChange={(e) => { setStrategy(e.target.value); touch() }}
          placeholder="Strategy note — what's the vision for this build?"
          style={{ flex: '1 1 100%', fontSize: 12 }}
        />
        <div style={{ flexBasis: '100%', fontSize: 10, color: 'var(--iff-subtext)' }}>
          🔒 Prototypes are private — only you can ever see them.
        </div>
      </div>

      {/* ── Year summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {YEARS.map((yr) => {
          const t = totals[yr]
          const over = t.left < 0
          return (
            <div key={yr} className="iff-card" style={{ padding: '12px 10px', textAlign: 'center', border: over ? '1.5px solid rgba(239,68,68,0.6)' : '1px solid transparent' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)' }}>{activeSeason + yr}</div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 900, color: over ? '#EF4444' : 'var(--iff-gold)', marginTop: 2 }}>
                ${t.cost}
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--iff-subtext)' }}>keeper cost</div>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: over ? '#EF4444' : 'var(--iff-green)' }}>
                ${t.left} left
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--iff-subtext)' }}>of ${AUCTION_BUDGET} auction</div>
              <div className="tnum" style={{ fontSize: 11, marginTop: 5, color: t.count > ROSTER_SIZE ? '#EF4444' : 'var(--iff-subtext)' }}>
                {t.count}/{ROSTER_SIZE} spots
              </div>
              {t.overCap && (
                <div style={{ fontSize: 9, fontWeight: 700, color: '#EF4444', marginTop: 4 }}>OVER ${ROSTER_CAP} CAP</div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)', lineHeight: 1.5, padding: '0 2px' }}>
        Tap a year's price to keep / X-out a player for that season. ${AUCTION_BUDGET} is your auction
        budget — the planning number. ${ROSTER_CAP} is the in-season roster cap ceiling.
      </div>

      {/* ── Position groups ── */}
      {POS_ORDER.concat('Other').filter((pos) => grouped[pos]?.length).map((pos) => (
        <div key={pos} className="iff-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px 64px 30px', gap: 6, padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--iff-accent)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
            <span>{pos}</span>
            {YEARS.map((yr) => <span key={yr} style={{ textAlign: 'center', color: 'var(--iff-subtext)' }}>'{String(activeSeason + yr).slice(2)}</span>)}
            <span />
          </div>
          {grouped[pos].map(({ asset, keep }) => (
            <div key={asset.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px 64px 30px', gap: 6, padding: '8px 12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{asset.name}</span>
                {asset.teamName !== userTeam && (
                  <span style={{ display: 'block', fontSize: 9.5, color: 'var(--iff-gold)' }}>{asset.teamName}'s player</span>
                )}
              </span>
              {YEARS.map((yr) => {
                const price = priceFor(asset, yr)
                const kept = keep[yr]
                const dead = price <= 0
                return (
                  <button
                    key={yr}
                    onClick={() => !dead && toggleKeep(asset.id, yr)}
                    disabled={dead}
                    className="tnum"
                    style={{
                      padding: '6px 4px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, textAlign: 'center',
                      background: dead ? 'transparent' : kept ? 'rgba(74,222,128,0.16)' : 'var(--iff-elevated)',
                      color: dead ? 'rgba(158,168,184,0.35)' : kept ? 'var(--iff-green)' : 'var(--iff-subtext)',
                      textDecoration: !dead && !kept ? 'line-through' : 'none',
                      border: kept ? '1px solid rgba(74,222,128,0.45)' : '1px solid transparent',
                    }}
                  >
                    {dead ? '—' : `$${price}`}
                  </button>
                )
              })}
              <button onClick={() => removeEntry(asset.id)} aria-label={`Remove ${asset.name}`} style={{ color: 'var(--iff-subtext)', fontSize: 13, textAlign: 'center' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* ── Budget placeholders ── */}
      <div className="iff-card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px 64px 30px', gap: 6, padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
          <span>Budget Slots</span>
          {YEARS.map((yr) => <span key={yr} style={{ textAlign: 'center', color: 'var(--iff-subtext)' }}>'{String(activeSeason + yr).slice(2)}</span>)}
          <span />
        </div>
        {placeholders.map((ph) => (
          <div key={ph.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px 64px 30px', gap: 6, padding: '8px 12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {ph.label} <span style={{ fontSize: 9.5, color: 'var(--iff-subtext)' }}>({ph.position})</span>
            </span>
            {YEARS.map((yr) => (
              <input
                key={yr}
                type="number"
                min="0"
                value={ph.prices?.[yr] ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0
                  setPlaceholders((prev) => prev.map((x) => (x.id === ph.id ? { ...x, prices: { ...x.prices, [yr]: v } } : x)))
                  touch()
                }}
                className="tnum"
                style={{ padding: '5px 4px', fontSize: 12.5, textAlign: 'center' }}
              />
            ))}
            <button
              onClick={() => { setPlaceholders((prev) => prev.filter((x) => x.id !== ph.id)); touch() }}
              aria-label={`Remove ${ph.label}`}
              style={{ color: 'var(--iff-subtext)', fontSize: 13, textAlign: 'center' }}
            >
              ✕
            </button>
          </div>
        ))}

        {phForm ? (
          <div style={{ display: 'flex', gap: 8, padding: '10px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Label (RB4, Flier WR…)"
              value={phForm.label}
              onChange={(e) => setPhForm((f) => ({ ...f, label: e.target.value }))}
              style={{ flex: '1 1 120px', fontSize: 12 }}
            />
            <select value={phForm.position} onChange={(e) => setPhForm((f) => ({ ...f, position: e.target.value }))} style={{ width: 70, fontSize: 12 }}>
              {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => <option key={p}>{p}</option>)}
            </select>
            {['p0', 'p1', 'p2'].map((k, i) => (
              <input key={k} type="number" min="0" placeholder={`'${String(activeSeason + i).slice(2)} $`} value={phForm[k] ?? ''} onChange={(e) => setPhForm((f) => ({ ...f, [k]: e.target.value }))} className="tnum" style={{ width: 62, fontSize: 12, textAlign: 'center' }} />
            ))}
            <button className="btn-outline" onClick={addPlaceholder} style={{ fontSize: 11, padding: '6px 12px' }}>Add</button>
            <button onClick={() => setPhForm(null)} style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setPhForm({ label: '', position: 'RB', p0: '', p1: '', p2: '' })}
            style={{ width: '100%', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: 'var(--iff-gold)', textAlign: 'left' }}
          >
            ＋ Add budget slot (plan $ for a player you don't have yet)
          </button>
        )}
      </div>

      {/* ── Add any league player ── */}
      <div className="iff-card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>＋ Add player</span>
        <select value="" onChange={(e) => addAsset(e.target.value)} style={{ flex: 1 }} aria-label="Add player to plan">
          <option value="">Anyone in the league…</option>
          <optgroup label={`My Team (${userTeam})`}>
            {addable.mine.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — ${priceFor(a, 0)}</option>
            ))}
          </optgroup>
          {fantasyTeams.filter((t) => t.name !== userTeam).map((t) =>
            addable.byTeam[t.name]?.length ? (
              <optgroup key={t.name} label={t.name}>
                {addable.byTeam[t.name].map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — ${priceFor(a, 0)}</option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </div>
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)', padding: '0 2px' }}>
        Adding another team's player plans for acquiring them — their salary counts in your math.
      </div>
    </div>
  )
}
