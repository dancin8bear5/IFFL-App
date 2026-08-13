// AdminView — port of Views/AdminView.swift. Commissioner-only panel.
// Sections: Database, Players, Picks, Trades, Messages, Teams, Access.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { PosBadge, DetailOverlay, ChipScroller } from '../components/shared'
import * as fs from '../services/firestoreService'
import { getFunctionsClient } from '../firebase'
import { httpsCallable } from 'firebase/functions'

const SECTIONS = ['Database', 'Players', 'Picks', 'Trades', 'Messages', 'Teams', 'Access', 'GroupMe']

export default function AdminView() {
  const [section, setSection] = useState('Database')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">Admin</div>
        <div className="nav-side right" />
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
        <ChipScroller>
          <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  background: s === section ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: s === section ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </ChipScroller>
      </div>

      <div style={{ padding: 14 }}>
        {section === 'Database' && <DatabaseSection />}
        {section === 'Players' && <PlayersSection />}
        {section === 'Picks' && <PicksSection />}
        {section === 'Trades' && <TradesSection />}
        {section === 'Messages' && <MessagesSection />}
        {section === 'Teams' && <TeamsSection />}
        {section === 'Access' && <AccessSection />}
        {section === 'GroupMe' && <GroupMeSection />}
      </div>
    </div>
  )
}

// ── Database ──────────────────────────────────────────────────

function DatabaseSection() {
  const { players, draftPicks, trades, activeSeason, setActiveSeason, isOffSeason, setIsOffSeason } = useApp()
  const [seasonInput, setSeasonInput] = useState(String(activeSeason))
  const [busy, setBusy] = useState(false)
  const pendingCount = trades.filter((t) => t.status === 'proposed' || t.status === 'accepted').length

  async function toggleOffSeason() {
    const next = !isOffSeason
    setIsOffSeason(next)
    await fs.setOffSeason(next).catch(() => {})
  }

  async function saveSeason() {
    const year = Number(seasonInput)
    if (!year || year < 2020 || year > 2100) return
    setBusy(true)
    try {
      await fs.updateActiveSeasonYear(year).catch(() => {})
      setActiveSeason(year)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="iff-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
          <Stat value={players.length} label="Players" />
          <Stat value={draftPicks.length} label="Picks" />
          <Stat value={pendingCount} label="Pending Trades" />
        </div>
      </div>

      <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14 }}>Off-Season Mode</span>
          <button
            role="switch"
            aria-checked={isOffSeason}
            onClick={toggleOffSeason}
            style={{
              width: 44, height: 26, borderRadius: 13, position: 'relative',
              background: isOffSeason ? '#22C55E' : 'var(--iff-elevated)', transition: 'background 0.15s',
            }}
          >
            <span style={{ position: 'absolute', top: 2, left: isOffSeason ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </button>
        </div>
        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, flex: 1 }}>Active Season</span>
          <input
            type="number"
            value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            style={{ width: 90, textAlign: 'center' }}
          />
          <button className="btn-outline" onClick={saveSeason} disabled={busy} style={{ fontSize: 12, padding: '6px 14px' }}>
            Save
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Database seeding (players, NFL teams, league history) runs from the iOS admin panel or a
        server script — not from the web app.
      </div>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: 'var(--iff-gold)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>{label}</div>
    </div>
  )
}

// ── Players ───────────────────────────────────────────────────

const EMPTY_PLAYER = {
  name: '', position: 'QB', teamName: fantasyTeams[0].name, playerPool: 'Auction',
  purchaseYear: 2026, contractYearsRemaining: 1, originalPrice: 0,
  prices: { 2026: 0, 2027: 0, 2028: 0 }, tradeHistory: [], isActive: true, acquiredSeason: 2026,
}

function PlayersSection() {
  const { players, activeSeason } = useApp()
  const [editing, setEditing] = useState(null) // player object or 'new'
  const sorted = useMemo(
    () => [...players].sort((a, b) => (b.prices?.[String(activeSeason)] ?? 0) - (a.prices?.[String(activeSeason)] ?? 0)),
    [players, activeSeason],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button className="btn-primary" onClick={() => setEditing('new')} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        ＋ Add Player
      </button>
      <div className="iff-card">
        {sorted.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setEditing(p)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: i < sorted.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}
          >
            <PosBadge position={p.position} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)' }}>{p.teamName}</span>
            </span>
            <span className="tnum green" style={{ fontSize: 13, fontWeight: 700 }}>
              ${p.prices?.[String(activeSeason)] ?? 0}
            </span>
          </button>
        ))}
      </div>
      {editing && <PlayerEditOverlay player={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlayerEditOverlay({ player, onClose }) {
  const [form, setForm] = useState(player ?? EMPTY_PLAYER)
  const [busy, setBusy] = useState(false)
  const isNew = !player
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setPrice = (yr, val) => setForm((f) => ({ ...f, prices: { ...f.prices, [yr]: Number(val) || 0 } }))

  async function save() {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      if (isNew) await fs.addPlayer(form).catch(() => {})
      else {
        const { id, ...doc } = form
        await fs.updatePlayer(id, doc).catch(() => {})
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    if (!player?.id) return
    setBusy(true)
    try {
      await fs.deactivatePlayer(player.id).catch(() => {})
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailOverlay title={isNew ? 'Add Player' : 'Edit Player'} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Player name" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Position">
            <select value={form.position} onChange={(e) => set({ position: e.target.value })}>
              {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Team">
            <select value={form.teamName} onChange={(e) => set({ teamName: e.target.value })}>
              {fantasyTeams.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="NFL Team">
            <input value={form.nflTeam ?? ''} onChange={(e) => set({ nflTeam: e.target.value || null })} placeholder="e.g. Buffalo Bills" />
          </Field>
          <Field label="Contract Years">
            <input type="number" value={form.contractYearsRemaining} onChange={(e) => set({ contractYearsRemaining: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <Field label="Prices">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {['2026', '2027', '2028'].map((yr) => (
              <div key={yr}>
                <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginBottom: 3 }}>{yr}</div>
                <input type="number" value={form.prices?.[yr] ?? 0} onChange={(e) => setPrice(yr, e.target.value)} />
              </div>
            ))}
          </div>
        </Field>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name.trim()}>
          {busy ? 'Saving…' : isNew ? 'Add Player' : 'Save Changes'}
        </button>
        {!isNew && (
          <button onClick={deactivate} disabled={busy} style={{ color: '#EF4444', fontSize: 14, fontWeight: 600, padding: 10 }}>
            Deactivate Player
          </button>
        )}
      </div>
    </DetailOverlay>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--iff-subtext)' }}>
      {label}
      {children}
    </label>
  )
}

// ── Picks ─────────────────────────────────────────────────────

function PicksSection() {
  const { draftPicks, activeSeason } = useApp()
  const [converting, setConverting] = useState(null)
  const sorted = useMemo(
    () => [...draftPicks].sort((a, b) => a.season - b.season || a.round - b.round),
    [draftPicks],
  )

  return (
    <div className="iff-card">
      {sorted.length === 0 && <div className="empty-state" style={{ padding: 32 }}><div>No available picks.</div></div>}
      {sorted.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < sorted.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
              {p.season} Round {p.round}{p.slot ? ` (Pick ${p.slot})` : ''}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)' }}>
              {p.currentTeamName} · ${p.prices?.[String(activeSeason)] ?? 0}
            </span>
          </span>
          <button className="btn-outline" onClick={() => setConverting(p)} style={{ fontSize: 11, padding: '5px 12px' }}>
            Draft Player
          </button>
        </div>
      ))}
      {converting && <PickConversionOverlay pick={converting} onClose={() => setConverting(null)} />}
    </div>
  )
}

function PickConversionOverlay({ pick, onClose }) {
  const [name, setName] = useState('')
  const [nfl, setNfl] = useState('')
  const [position, setPosition] = useState('RB')
  const [busy, setBusy] = useState(false)

  async function convert() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await fs
        .convertPickToPlayer(pick.id, {
          name: name.trim(), position, teamName: pick.currentTeamName,
          nflTeam: nfl.trim() || null, playerPool: 'Rookie Draft',
          rookieRound: pick.round, rookieDraftYear: pick.season,
          purchaseYear: pick.season, acquiredSeason: pick.season,
          contractYearsRemaining: 3, originalPrice: pick.prices?.[String(pick.season)] ?? 0,
          prices: pick.prices ?? {}, tradeHistory: [], isActive: true,
        })
        .catch(() => {})
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailOverlay title={`${pick.season} R${pick.round} → Player`} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Player Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Drafted player" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Position">
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="NFL Team">
            <input value={nfl} onChange={(e) => setNfl(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <button className="btn-primary" onClick={convert} disabled={busy || !name.trim()}>
          {busy ? 'Converting…' : 'Convert Pick'}
        </button>
      </div>
    </DetailOverlay>
  )
}

// ── Trades ────────────────────────────────────────────────────

function TradesSection() {
  const { trades } = useApp()
  const [busyId, setBusyId] = useState(null)
  const actionable = trades.filter((t) => t.status === 'proposed' || t.status === 'accepted')

  async function execute(trade) {
    setBusyId(trade.id)
    try {
      await fs.executeTrade(trade.id).catch(() => {})
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="iff-card">
      {actionable.length === 0 && (
        <div className="empty-state" style={{ padding: 32 }}><div>No pending or accepted trades.</div></div>
      )}
      {actionable.map((t, i) => (
        <div key={t.id} style={{ padding: '12px 14px', borderBottom: i < actionable.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t.proposingTeamName} ↔ {t.receivingTeamName}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: t.status === 'accepted' ? '#22C55E' : 'var(--iff-gold)' }}>
              {t.status.toUpperCase()}
            </span>
          </div>
          {t.status === 'accepted' && (
            <button
              className="btn-outline"
              onClick={() => execute(t)}
              disabled={busyId === t.id}
              style={{ marginTop: 8, fontSize: 11, padding: '6px 14px' }}
            >
              {busyId === t.id ? 'Executing…' : 'Execute Trade (ESPN Confirmed)'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Messages ──────────────────────────────────────────────────

function MessagesSection() {
  const { messages } = useApp()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function post() {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await fs.addMessage(draft.trim()).catch(() => {})
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Post a league-wide message…"
          style={{ resize: 'vertical' }}
        />
        <button className="btn-primary" onClick={post} disabled={busy || !draft.trim()} style={{ alignSelf: 'flex-end', padding: '10px 20px', fontSize: 14 }}>
          {busy ? 'Posting…' : 'Post Message'}
        </button>
      </div>
      <div className="iff-card">
        {messages.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderBottom: i < messages.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{m.content}</span>
            <button onClick={() => fs.deleteMessage(m.id).catch(() => {})} aria-label="Delete message" style={{ color: '#EF4444', fontSize: 14 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Teams (userTeamMap) ───────────────────────────────────────

function TeamsSection() {
  const [config, setConfig] = useState(null)
  const [uid, setUid] = useState('')
  const [team, setTeam] = useState(fantasyTeams[0].name)
  const [busy, setBusy] = useState(false)

  const reload = () => fs.fetchLeagueConfig().then(setConfig).catch(() => setConfig(null))
  useEffect(() => { reload() }, [])

  async function assign() {
    if (!uid.trim()) return
    setBusy(true)
    try {
      await fs.assignTeam(uid.trim(), team).catch(() => {})
      setUid('')
      reload()
    } finally {
      setBusy(false)
    }
  }

  const entries = Object.entries(config?.userTeamMap ?? {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Paste user UID" />
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ flex: 1 }}>
            {fantasyTeams.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
          <button className="btn-outline" onClick={assign} disabled={busy || !uid.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>
            Assign
          </button>
        </div>
      </div>
      <div className="iff-card">
        {entries.length === 0 && <div className="empty-state" style={{ padding: 24 }}><div>No team assignments loaded.</div></div>}
        {entries.map(([mapUid, mapTeam], i) => (
          <div key={mapUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < entries.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{mapTeam}</span>
              <span style={{ display: 'block', fontSize: 9, color: 'var(--iff-subtext)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mapUid}</span>
            </span>
            <button
              onClick={() => fs.removeTeamAssignment(mapUid).then(reload).catch(() => {})}
              aria-label="Remove assignment"
              style={{ color: '#EF4444', fontSize: 16 }}
            >
              ⊖
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Access (authorizedUIDs) ───────────────────────────────────

function AccessSection() {
  const { user } = useApp()
  const [config, setConfig] = useState(null)
  const [uid, setUid] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => fs.fetchLeagueConfig().then(setConfig).catch(() => setConfig(null))
  useEffect(() => { reload() }, [])

  async function add() {
    if (!uid.trim()) return
    setBusy(true)
    try {
      await fs.addAuthorizedUID(uid.trim()).catch(() => {})
      setUid('')
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {user && (
        <div className="iff-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            My UID
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>{user.uid}</div>
        </div>
      )}
      <div className="iff-card" style={{ padding: 14, display: 'flex', gap: 10 }}>
        <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Paste UID to authorize" style={{ flex: 1 }} />
        <button className="btn-outline" onClick={add} disabled={busy || !uid.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>
          Add
        </button>
      </div>
      <div className="iff-card">
        {(config?.authorizedUIDs ?? []).map((authUid, i, arr) => (
          <div key={authUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authUid}</span>
            <button
              onClick={() => fs.removeAuthorizedUID(authUid).then(reload).catch(() => {})}
              aria-label="Remove authorization"
              style={{ color: '#EF4444', fontSize: 16 }}
            >
              ⊖
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GroupMe (trade DM notifications) ──────────────────────────

function GroupMeSection() {
  const [directory, setDirectory] = useState(null) // {groups:[{id,name,members}]}
  const [groupId, setGroupId] = useState('')
  const [userMap, setUserMap] = useState({}) // teamName -> groupme userId
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  // Load any existing mapping on mount
  useEffect(() => {
    fs.fetchGroupMeConfig()
      .then((cfg) => {
        if (cfg) {
          setGroupId(cfg.groupId ?? '')
          setUserMap(cfg.userMap ?? {})
        }
      })
      .catch(() => {})
  }, [])

  async function loadDirectory() {
    setLoading(true)
    setError(null)
    try {
      const call = httpsCallable(await getFunctionsClient(), 'groupmeDirectory')
      const res = await call()
      setDirectory(res.data)
      if (!groupId && res.data.groups?.length === 1) setGroupId(res.data.groups[0].id)
    } catch (err) {
      setError(
        err.message?.includes('GROUPME_TOKEN')
          ? 'The GroupMe token isn’t set yet. Run: firebase functions:secrets:set GROUPME_TOKEN'
          : `Couldn’t reach GroupMe: ${err.message}`,
      )
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await fs.saveGroupMeConfig({ groupId, userMap })
      setSavedAt(Date.now())
    } catch (err) {
      setError(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const group = directory?.groups?.find((g) => g.id === groupId)
  const mappedCount = Object.values(userMap).filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Trade offers and responses are sent as GroupMe direct messages (from your account).
        Match each league member's GroupMe identity to their fantasy team once — done forever.
      </div>

      <button className="btn-primary" onClick={loadDirectory} disabled={loading} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        {loading ? 'Loading…' : directory ? 'Reload Groups' : 'Load My GroupMe Groups'}
      </button>

      {error && (
        <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-accent)', lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      {directory && (
        <div className="iff-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            League Group Chat
          </div>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Select group…</option>
            {directory.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.members.length} members)</option>
            ))}
          </select>
        </div>
      )}

      {group && (
        <div className="iff-card">
          <div style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
            Map Members to Teams ({mappedCount}/{fantasyTeams.length})
          </div>
          {fantasyTeams.map((t, i) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < fantasyTeams.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <select
                value={userMap[t.name] ?? ''}
                onChange={(e) => setUserMap((m) => ({ ...m, [t.name]: e.target.value || undefined }))}
                style={{ width: 190 }}
              >
                <option value="">— no DMs —</option>
                {group.members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.nickname}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {(group || mappedCount > 0) && (
        <button className="btn-primary" onClick={save} disabled={saving || !groupId}>
          {saving ? 'Saving…' : savedAt ? 'Saved ✓ — Save Again' : 'Save Mapping'}
        </button>
      )}
    </div>
  )
}
