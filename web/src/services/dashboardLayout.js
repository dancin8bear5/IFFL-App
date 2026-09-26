// dashboardLayout — the commissioner's stored Dashboard arrangement,
// resolved against the registry.
//
// The registry (services/dashboardSections.js) is the DEFAULT: its order is
// the order and its `rail` flag is the column. `config/league.dashboardLayout`
// is an override — an array of `{ key, column }`, `column` being 'main' or
// 'rail' — written from Admin → Layout and read live by every open browser.
//
// This module exists so that the four rules below are TESTED rather than
// implied by the shape of a reduce somewhere in a 1,000-line view. Each one
// is here because of the way it fails if it's missing:
//
// 1. A section the stored layout doesn't mention keeps its REGISTRY
//    position — placed after its nearest preceding registry neighbour, not
//    appended to the end. Without this, every section added after the
//    commissioner last saved would appear at the bottom of the page (or,
//    worse, be dropped) weeks after the change that caused it, with nothing
//    connecting cause to effect.
// 2. A stored key the registry doesn't know is ignored, so deleting a
//    section from the code can't strand the saved layout.
// 3. A stored 'rail' for a section that isn't `railSafe` is refused. The rail
//    is 270px; the twelve-team grid is not going in it, however the document
//    got edited.
// 4. A stored value that isn't a list at all reads as NO OVERRIDE, never as
//    an empty layout. Same instinct as the season calendar degrading to the
//    most restrictive phase: unreadable input falls back to the known-good
//    default rather than to a guess that empties the page.
//
// What this module deliberately does NOT do: decide whether a section is
// VISIBLE. That is `areaEnabled` (Admin → Areas) and `phases` (the
// calendar). Layout answers WHERE only — two separate switches that both
// hide things is how you end up unable to work out why a block won't appear.

export const COLUMNS = ['main', 'rail']

/**
 * The stored entries, cleaned: known keys only, first occurrence wins, and
 * a column only where one was legibly given.
 *
 * Returns null when the value isn't a list — the caller reads that as "no
 * override", which is rule 4.
 */
function sanitize(stored, byKey) {
  if (!Array.isArray(stored)) return null
  const seen = new Set()
  const out = []
  for (const entry of stored) {
    if (!entry || typeof entry !== 'object') continue
    const key = entry.key
    if (typeof key !== 'string' || !byKey[key] || seen.has(key)) continue
    seen.add(key)
    const column = COLUMNS.includes(entry.column) ? entry.column : null
    out.push({ key, column })
  }
  return out
}

/**
 * Where a section ends up, given what was stored and what it is allowed to do.
 *
 * `railSafe` is checked here rather than only in the Admin UI: a rule the
 * editor enforces is a rule the database doesn't have.
 */
function columnFor(section, stored) {
  const want = stored ?? (section.rail ? 'rail' : 'main')
  return want === 'rail' && section.railSafe ? 'rail' : 'main'
}

/**
 * The effective section list: registry entries in the order they should
 * render, each carrying a resolved `rail` boolean.
 *
 * @param registry - DASHBOARD_SECTIONS (or a fixture)
 * @param stored   - config/league.dashboardLayout, or anything at all
 */
export function resolveLayout(registry, stored) {
  const sections = Array.isArray(registry) ? registry.filter((s) => s?.key) : []
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s]))
  const entries = sanitize(stored, byKey)

  const column = new Map((entries ?? []).map((e) => [e.key, e.column]))
  const order = (entries ?? []).map((e) => e.key)

  // Rule 1: walk the registry in its own order and slot in anything the
  // stored list left out, immediately after the nearest earlier section that
  // IS in the list. Walking forwards means consecutive newcomers keep their
  // registry order relative to each other.
  sections.forEach((section, i) => {
    if (order.includes(section.key)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const found = order.indexOf(sections[j].key)
      if (found >= 0) { at = found + 1; break }
    }
    order.splice(at, 0, section.key)
  })

  return order.map((key) => ({
    ...byKey[key],
    rail: columnFor(byKey[key], column.get(key)) === 'rail',
  }))
}

/**
 * The layout as Admin should save it: a full snapshot of what is on screen
 * right now, so the stored document reads as the arrangement rather than as
 * a diff nobody can interpret a year later.
 */
export function toStored(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter((s) => s?.key)
    .map((s) => ({ key: s.key, column: s.rail ? 'rail' : 'main' }))
}

/**
 * Move one section up or down within the column it is in.
 *
 * Reordering is per-column because that is what the commissioner sees: on
 * the desktop the two columns are side by side, so "up" inside the rail must
 * not mean "jump over nine main-column sections". The returned list keeps
 * every other section exactly where it was.
 */
export function moveSection(sections, key, direction) {
  const list = [...(Array.isArray(sections) ? sections : [])]
  const from = list.findIndex((s) => s?.key === key)
  if (from < 0) return list
  const rail = !!list[from].rail
  const step = direction === 'up' ? -1 : 1
  // The neighbour in the SAME column, which may be several places away.
  let to = -1
  for (let i = from + step; i >= 0 && i < list.length; i += step) {
    if (!!list[i].rail === rail) { to = i; break }
  }
  if (to < 0) return list
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return list
}

/**
 * Move a section to the other column, or refuse if it can't live there.
 *
 * A section arriving in a column goes to the END of it, which is the only
 * position that means anything: it was ordered relative to a different set
 * of neighbours a moment ago.
 */
export function setColumn(sections, key, column) {
  const list = [...(Array.isArray(sections) ? sections : [])]
  const from = list.findIndex((s) => s?.key === key)
  if (from < 0) return list
  const rail = column === 'rail'
  if (rail && !list[from].railSafe) return list
  if (!!list[from].rail === rail) return list
  const [moved] = list.splice(from, 1)
  const updated = { ...moved, rail }
  // Last of its new column: find the final index holding that column.
  let at = list.length
  for (let i = list.length - 1; i >= 0; i--) {
    if (!!list[i].rail === rail) { at = i + 1; break }
  }
  list.splice(at, 0, updated)
  return list
}
