// podSpoiler — "black until you click it" for the POD's awards and bold calls.
//
// The three hosts enter their picks before the show and then screen-share
// this page while recording it. Plain text spoils every pick the moment the
// page opens, so each entry renders as a black bar until it is clicked.
//
// The whole module is one non-obvious rule, which is why it lives here with
// tests rather than inside the component:
//
//   A REVEAL IS TIED TO THE VALUE, NOT THE SLOT.
//
// Store "MVP/Jared is revealed" and next season's MVP pick shows up already
// revealed the instant it is saved — because that cell was clicked a year
// ago. So the store maps id -> the exact value that was revealed, and an
// entry counts as revealed only while the current value still matches.
// Editing a pick therefore sends it back to black, which is both the
// behaviour you want and the bug you would never think to look for.
//
// Reveal state is a viewing preference, not league data: it stays in this
// browser and is never written to config/pod. (That doc is a one-shot read
// with no listener, so a stored reveal would not reach the other hosts live
// anyway.)

const STORE_KEY = 'iffl.pod.revealed'

/** A stable id for one entry. Awards use category+host; bold calls host+index. */
export function spoilerId(...parts) {
  return parts.map((p) => String(p ?? '')).join('::')
}

/**
 * Blank is never hidden and never revealable — a black bar over an empty
 * cell would advertise a pick that was never made. Whitespace counts as
 * blank, since that is what a half-filled input leaves behind.
 */
export function isBlank(value) {
  return value == null || String(value).trim() === ''
}

/** Revealed only while the stored value still matches what is on screen. */
export function isRevealed(store, id, value) {
  if (isBlank(value)) return false
  return Object.prototype.hasOwnProperty.call(store ?? {}, id) && store[id] === value
}

export function reveal(store, id, value) {
  if (isBlank(value)) return store ?? {}
  return { ...(store ?? {}), [id]: value }
}

export function hide(store, id) {
  const next = { ...(store ?? {}) }
  delete next[id]
  return next
}

/** Click = toggle. With no master control this is the only way back to black. */
export function toggle(store, id, value) {
  return isRevealed(store, id, value) ? hide(store, id) : reveal(store, id, value)
}

/**
 * Anything that isn't a flat object of strings is discarded rather than
 * trusted — the same "validate before you believe it" stance as
 * AdminView's loadLastSection.
 */
export function parseStore(raw) {
  if (!raw) return {}
  let parsed
  try { parsed = JSON.parse(raw) } catch { return {} }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function loadStore() {
  try { return parseStore(localStorage.getItem(STORE_KEY)) } catch { return {} } // private mode / storage blocked
}

export function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store ?? {})) } catch { /* non-fatal */ }
}
