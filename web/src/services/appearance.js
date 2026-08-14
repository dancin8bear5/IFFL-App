// appearance — applies user appearance settings to the document.
// Used by AppContext (saved settings) and SettingsView (live preview while
// editing, restored on cancel).
import { teamByName } from '../data/staticData'

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
  // 90s mode
  if (settings.retroMode) root.dataset.retro = '1'
  else delete root.dataset.retro
  // Accent (90s mode owns its own neon accent — don't fight it)
  if (!settings.retroMode && settings.accentColor && settings.accentColor !== 'red') {
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
