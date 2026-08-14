// appearance — applies user appearance settings to the document.
// Used by AppContext (saved settings) and SettingsView (live preview while
// editing, restored on cancel).
import { teamByName } from '../data/staticData'

// Era themes — each reskins the whole app to a decade (or to Soldier Field).
// '90s' keeps the original data-retro CSS; the rest use data-era blocks.
export const UI_THEMES = [
  { key: 'default', label: 'Modern',   glyph: '🏟️', blurb: 'The standard Insanity League look' },
  { key: '50s',     label: '1950s',    glyph: '🍒', blurb: 'Chrome diner — cream, cherry red & teal' },
  { key: '60s',     label: '1960s',    glyph: '☮️', blurb: 'Groovy — mustard, burnt orange & flower power' },
  { key: '70s',     label: '1970s',    glyph: '🕺', blurb: 'Funk — harvest gold, avocado & shag stripes' },
  { key: '80s',     label: '1980s',    glyph: '🕹️', blurb: 'Synthwave — neon on the grid' },
  { key: '90s',     label: '1990s',    glyph: '📼', blurb: 'Saved by the Bell — full Memphis cheese' },
  { key: '2000s',   label: '2000s',    glyph: '💿', blurb: 'Y2K — glossy aqua, silver & Frutiger air' },
  { key: 'bears',   label: 'Da Bears', glyph: '🐻', blurb: 'BEAR DOWN. Navy & orange, Monsters of the Midway' },
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

/** Apply appearance settings to the live document. */
export function applyAppearance(settings, userTeam) {
  const root = document.documentElement
  const theme = resolveTheme(settings)

  // Era theme: 90s rides the original data-retro CSS; others use data-era
  if (theme === '90s') root.dataset.retro = '1'
  else delete root.dataset.retro
  if (theme !== 'default' && theme !== '90s') root.dataset.era = theme
  else delete root.dataset.era

  // Accent — era themes own their own palette; don't fight them
  if (theme === 'default' && settings.accentColor && settings.accentColor !== 'red') {
    root.style.setProperty('--iff-accent', resolveAccent(settings.accentColor, userTeam))
  } else {
    root.style.removeProperty('--iff-accent')
  }
  // Text size
  const size = TEXT_SIZES.find((t) => t.key === settings.textSize)?.pct
  if (size && size !== '100%') root.style.fontSize = size
  else root.style.removeProperty('font-size')
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
