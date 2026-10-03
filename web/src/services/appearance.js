// appearance — applies user appearance settings to the document.
// Used by AppContext (saved settings) and SettingsView (live preview while
// editing, restored on cancel).
// Extension is explicit so `node --test` can resolve this under the new
// appearance.test.js — Vite is happy either way, Node is not.
import { teamByName } from '../data/staticData.js'

// Era themes — each reskins the whole app to a decade (or to Soldier Field).
// '90s' keeps the original data-retro CSS; the rest use data-era blocks.
export const UI_THEMES = [
  { key: 'default', label: 'Modern',   glyph: '🏟️', blurb: 'The standard Insanity League look' },
  { key: '50s',     label: '1950s',    glyph: '🍒', blurb: 'Chrome diner — cream, cherry red & teal' },
  { key: '60s',     label: '1960s',    glyph: '☮️', blurb: 'Groovy — mustard, burnt orange & flower power' },
  { key: '70s',     label: '1970s',    glyph: '🥑', blurb: 'Avocado kitchen — olive green, harvest gold & shag' },
  { key: '80s',     label: '1980s',    glyph: '🕹️', blurb: 'Synthwave — neon on the grid' },
  { key: '90s',     label: '1990s',    glyph: '📼', blurb: 'Saved by the Bell — full Memphis cheese' },
  { key: '2000s',   label: '2000s',    glyph: '💿', blurb: 'Y2K — glossy aqua, silver & Frutiger air' },
  { key: 'bears',   label: 'Da Bears', glyph: '🐻', blurb: 'BEAR DOWN. Navy & orange, Monsters of the Midway' },
  { key: '2150',    label: '2150',     glyph: '🧬', blurb: 'Bioluminescent — grown surfaces, light instead of lines' },
]

/** Active theme key, honoring the old retroMode boolean from before eras existed. */
export const resolveTheme = (settings) =>
  settings.uiTheme ?? (settings.retroMode ? '90s' : 'default')

export const ACCENT_CHOICES = [
  { key: 'red',    label: 'Classic Red',  color: '#E63946' },
  { key: 'team',   label: 'My Team',      color: null }, // resolved from team
  { key: 'teal',   label: 'Neon Teal',    color: '#00E5C7' },
  { key: 'gold',   label: 'Gold Rush',    color: '#F4A261' },
  { key: 'purple', label: 'Royal Purple', color: '#A855F7' },
]

export const TEXT_SIZES = [
  { key: 'small',   label: 'A–', pct: '93%' },
  { key: 'default', label: 'A',  pct: '100%' },
  { key: 'large',   label: 'A+', pct: '107%' },
]

export function resolveAccent(accentColor, userTeam) {
  if (accentColor === 'team') return teamByName[userTeam]?.color ?? '#E63946'
  return ACCENT_CHOICES.find((c) => c.key === accentColor)?.color ?? '#E63946'
}

/**
 * The four things appearance does to the document, as data.
 *
 * Pure, so it is unit-testable and — more importantly — so the exact values
 * that were applied can be CACHED and replayed at boot without re-deriving
 * them. The accent is resolved to a hex here precisely because 'team' needs
 * a team to resolve, and at boot we have no team yet.
 */
export function appearanceRecipe(settings = {}, userTeam) {
  const theme = resolveTheme(settings)
  const size = TEXT_SIZES.find((t) => t.key === settings.textSize)?.pct
  return {
    // 90s rides the original data-retro CSS; the other eras use data-era
    retro: theme === '90s',
    era: theme !== 'default' && theme !== '90s' ? theme : null,
    // Era themes own their own palette — don't fight them
    accent: theme === 'default' && settings.accentColor && settings.accentColor !== 'red'
      ? resolveAccent(settings.accentColor, userTeam)
      : null,
    fontSize: size && size !== '100%' ? size : null,
  }
}

/** Put a recipe on <html>. */
export function applyRecipe(recipe) {
  const root = document.documentElement
  if (recipe.retro) root.dataset.retro = '1'
  else delete root.dataset.retro
  if (recipe.era) root.dataset.era = recipe.era
  else delete root.dataset.era
  if (recipe.accent) root.style.setProperty('--iff-accent', recipe.accent)
  else root.style.removeProperty('--iff-accent')
  if (recipe.fontSize) root.style.fontSize = recipe.fontSize
  else root.style.removeProperty('font-size')
}

// ── The local cache ───────────────────────────────────────────
//
// Appearance is a VIEW preference, and until Sep 2026 its only home was a
// Firestore doc read after sign-in. That made the look of the app depend on
// a network round trip: every load painted Modern first and switched once
// the read landed, and a read that was slow, offline or refused left the
// user looking at a theme they had not chosen — indistinguishable from
// "my setting didn't save".
//
// So the applied recipe is mirrored here and replayed before React mounts.
// Firestore stays the source of truth (it is what follows you to another
// browser); this is the fast path, and it is per-browser by nature.
export const APPEARANCE_CACHE_KEY = 'iffl.appearance'

/** Last applied recipe, or null. Never throws — storage can be unavailable. */
export function readCachedRecipe() {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_CACHE_KEY)
    if (!raw) return null
    const r = JSON.parse(raw)
    if (!r || typeof r !== 'object') return null
    return {
      retro: !!r.retro,
      era: typeof r.era === 'string' ? r.era : null,
      accent: typeof r.accent === 'string' ? r.accent : null,
      fontSize: typeof r.fontSize === 'string' ? r.fontSize : null,
    }
  } catch {
    return null
  }
}

/** Remember a recipe for the next boot. Never throws. */
export function cacheRecipe(recipe) {
  try {
    window.localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(recipe))
  } catch {
    /* private mode, quota, storage blocked — the Firestore copy still works */
  }
}

/**
 * Apply the cached recipe, if any. Called once from main.jsx before render
 * so the app paints in the user's own theme instead of flashing Modern.
 */
export function applyCachedAppearance() {
  const r = readCachedRecipe()
  if (r) applyRecipe(r)
  return r
}

/** Apply appearance settings to the live document, and remember them. */
export function applyAppearance(settings, userTeam) {
  const recipe = appearanceRecipe(settings ?? {}, userTeam)
  applyRecipe(recipe)
  cacheRecipe(recipe)
  return recipe
}

// ── Victory confetti ──────────────────────────────────────────

/** Quick full-screen confetti burst (no libraries). */
export function fireConfetti() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const colors = ['#E63946', '#F4A261', '#4ADE80', '#38BDF8', '#A855F7', '#FFE93B']
  const parts = Array.from({ length: 140 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    size: Math.random() * 7 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
  }))

  let frame = 0
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of parts) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.35
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }
    frame++
    if (frame < 130) requestAnimationFrame(tick)
    else canvas.remove()
  }
  requestAnimationFrame(tick)
}
