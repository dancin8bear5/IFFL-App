// keeperImport — the once-a-year keeper-deadline reconciliation tool.
// Parses a Keeper Master-shaped CSV (paste or file), diffs it against the
// live players collection, and produces a reviewable plan before anything
// is written. Pure functions, zero Firebase deps (mirrors contracts.js /
// marketEngine.js) so the parsing and diff logic unit-tests clean.
//
// Column shape (header names are matched case-insensitively, trimmed):
//   Team, Position, Player, <season> Price, <season+1> Price,
//   <season+2> Price, Original Price, Purchase Year, Contract Year,
//   Player Pool, Rookie Round (opt), Draft Year (opt), Trade History (opt)
// This is exactly the 2025/2026 Keeper Master export shape. "Draft Pick"
// rows are recognized and skipped — picks are reconciled separately
// (rookie seeding, trade transfers), not through this player importer.
import { ROSTER_CAP } from '../data/staticData.js'

const REQUIRED_COLS = ['Team', 'Position', 'Player']

/** "$9) " / "$9 " / "$9" → 9. Returns null for blank/unparseable cells. */
function parseMoney(cell) {
  if (cell == null) return null
  const cleaned = String(cell).replace(/[^0-9.-]/g, '').trim()
  if (cleaned === '' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseInt_(cell) {
  const n = parseMoney(cell)
  return n == null ? null : Math.round(n)
}

/** Minimal CSV line splitter — handles quoted fields with embedded commas. */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const norm = (s) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Stable doc id so re-importing the same player only ever updates —
 * keyed by name+position (not team; see diffKeeperImport for why a trade
 * can't be part of the identity key).
 */
export const keeperDocId = (name, position) => `kp-${slug(name)}-${slug(position)}`

/**
 * Parse a Keeper Master CSV. `activeSeason` picks out the three price
 * columns (season, season+1, season+2) regardless of which year's export
 * it is. Returns {rows, pickRows, errors, headerMap}.
 *   rows: parsed player rows, one object per data line
 *   pickRows: count of "Draft Pick" rows skipped (not player docs)
 *   errors: [{line, message}] for rows that couldn't be parsed at all
 */
export function parseKeeperCSV(text, activeSeason) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { rows: [], pickRows: 0, errors: [{ line: 0, message: 'Empty file.' }], headerMap: null }

  const header = splitCsvLine(lines[0]).map((h) => h.trim())
  const findCol = (...names) => {
    for (const name of names) {
      const i = header.findIndex((h) => norm(h) === norm(name))
      if (i !== -1) return i
    }
    return -1
  }

  const col = {
    team: findCol('Team'),
    position: findCol('Position'),
    player: findCol('Player', 'Player Name'),
    p0: findCol(`${activeSeason} Price`),
    p1: findCol(`${activeSeason + 1} Price`),
    p2: findCol(`${activeSeason + 2} Price`),
    original: findCol('Original Price'),
    purchaseYear: findCol('Purchase Year'),
    contractYear: findCol('Contract Year'),
    playerPool: findCol('Player Pool'),
    rookieRound: findCol('Rookie Round'),
    draftYear: findCol('Draft Year'),
    tradeHistory: findCol('Trade History'),
  }

  const missingRequired = REQUIRED_COLS.filter((_, idx) => col[['team', 'position', 'player'][idx]] === -1)
  if (missingRequired.length > 0) {
    return {
      rows: [], pickRows: 0,
      errors: [{ line: 1, message: `Missing required column(s): ${missingRequired.join(', ')}` }],
      headerMap: col,
    }
  }
  if (col.p0 === -1) {
    return {
      rows: [], pickRows: 0,
      errors: [{ line: 1, message: `No "${activeSeason} Price" column found — check the active season.` }],
      headerMap: col,
    }
  }

  const rows = []
  const errors = []
  let pickRows = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const team = cells[col.team]?.trim()
    const position = cells[col.position]?.trim()
    const player = cells[col.player]?.trim()

    if (!team || !player) {
      errors.push({ line: i + 1, message: 'Missing team or player name — row skipped.' })
      continue
    }
    if (norm(position) === 'draft pick') {
      pickRows++
      continue
    }

    const prices = {}
    const p0 = parseMoney(cells[col.p0])
    const p1 = col.p1 !== -1 ? parseMoney(cells[col.p1]) : null
    const p2 = col.p2 !== -1 ? parseMoney(cells[col.p2]) : null
    if (p0 != null) prices[activeSeason] = p0
    if (p1 != null) prices[activeSeason + 1] = p1
    if (p2 != null) prices[activeSeason + 2] = p2

    if (p0 == null) {
      errors.push({ line: i + 1, message: `${player}: no ${activeSeason} price — row skipped.` })
      continue
    }

    rows.push({
      line: i + 1,
      team,
      position: position || '—',
      name: player,
      prices,
      originalPrice: col.original !== -1 ? parseMoney(cells[col.original]) : null,
      purchaseYear: col.purchaseYear !== -1 ? parseInt_(cells[col.purchaseYear]) : null,
      contractYearsRemaining: col.contractYear !== -1 ? parseInt_(cells[col.contractYear]) : null,
      playerPool: col.playerPool !== -1 ? cells[col.playerPool]?.trim() || null : null,
      rookieRound: col.rookieRound !== -1 ? parseInt_(cells[col.rookieRound]) : null,
      rookieDraftYear: col.draftYear !== -1 ? parseInt_(cells[col.draftYear]) : null,
      tradeNote: col.tradeHistory !== -1 ? cells[col.tradeHistory]?.trim() || null : null,
    })
  }

  return { rows, pickRows, errors, headerMap: col }
}

/** Shallow-compare the fields the importer owns; returns changed-field names. */
function diffFields(existing, incoming) {
  const changed = []
  const fieldsEqual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  if (norm(existing?.teamName) !== norm(incoming.team)) changed.push('team')
  if (norm(existing?.position) !== norm(incoming.position)) changed.push('position')
  for (const season of Object.keys(incoming.prices)) {
    if ((existing?.prices?.[season] ?? existing?.prices?.[String(season)]) !== incoming.prices[season]) {
      changed.push(`prices.${season}`)
    }
  }
  if (incoming.originalPrice != null && existing?.originalPrice !== incoming.originalPrice) changed.push('originalPrice')
  if (incoming.purchaseYear != null && existing?.purchaseYear !== incoming.purchaseYear) changed.push('purchaseYear')
  if (incoming.contractYearsRemaining != null && !fieldsEqual(existing?.contractYearsRemaining, incoming.contractYearsRemaining)) {
    changed.push('contractYearsRemaining')
  }
  if (incoming.playerPool != null && norm(existing?.playerPool) !== norm(incoming.playerPool)) changed.push('playerPool')
  return changed
}

/**
 * Diff parsed CSV rows against the live players list.
 * `players` — current DisplayAsset-shaped or raw player docs, must carry
 * {id, name, teamName, position, prices, originalPrice, purchaseYear,
 * contractYearsRemaining, playerPool, isActive}.
 *
 * Matched by name+position, NOT name+team — a trade moves a player's team,
 * so team can't be part of the identity key or every offseason trade would
 * show up as one drop + one phantom add instead of a single team change.
 * (Two real players sharing both name and position — e.g. two league eras
 * of the same name — is the one case this can misfire on; rare enough for
 * a 12-team keeper league to accept, and it'd surface as an extra "added"
 * plus a "missing" the admin can eyeball before applying.)
 *
 * Returns {added, changed, unchanged, missing, teamTotals, overCap}.
 */
export function diffKeeperImport(rows, players, activeSeason) {
  const active = players.filter((p) => p.isActive !== false)
  const key = (name, position) => `${norm(name)}|${norm(position)}`
  const byKey = new Map(active.map((p) => [key(p.name, p.position), p]))
  const seenKeys = new Set()

  const added = []
  const changed = []
  const unchanged = []

  for (const row of rows) {
    const k = key(row.name, row.position)
    seenKeys.add(k)
    const existing = byKey.get(k)
    if (!existing) {
      added.push(row)
      continue
    }
    const fields = diffFields(existing, row)
    if (fields.length === 0) unchanged.push(row)
    else changed.push({ ...row, existingId: existing.id, changedFields: fields, existing })
  }

  const missing = active.filter((p) => !p.isPick && !seenKeys.has(key(p.name, p.position)))

  // Cap sanity check on the imported data itself — sum row prices at
  // activeSeason per team, same $300 threshold as the live TAX DAT ASS guard.
  const teamTotals = {}
  for (const row of rows) {
    teamTotals[row.team] = (teamTotals[row.team] ?? 0) + (row.prices[activeSeason] ?? 0)
  }
  const overCap = Object.entries(teamTotals)
    .filter(([, total]) => total > ROSTER_CAP)
    .map(([team, total]) => ({ team, total }))

  return { added, changed, unchanged, missing, teamTotals, overCap }
}
