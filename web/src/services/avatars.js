// avatars — profile pictures for the twelve teams.
//
// Every avatar in the app renders through components/shared.jsx's
// TeamAvatar (30-odd call sites), so this module is the single place that
// decides what a team's picture IS. Change it here and it changes on the
// Dashboard, the power-rankings chart, rosters, trades, the ledger, the
// sidebar — everywhere, with no call-site edits.
//
// Resolution order, highest first:
//   1. upload  — a picture the owner chose off their device
//   2. preset  — one of the fun built-ins below
//   3. logo    — the team's shipped logo file in /logos
//   4. initials— colored fallback for former members / unknown names
//
// Uploads are stored as a downscaled data URL on the team's own
// teamAvatars doc rather than in Firebase Storage. Storage would mean a
// new bucket, a second rules file, and another deploy target; a 256px
// JPEG is ~15–30KB, which sits comfortably inside Firestore's 1MiB
// document ceiling and needs none of that. Avatars render at 18–40px,
// so 256px is already generous.

/**
 * The built-in picks. Emoji on a color — no image files to host, ship, or
 * keep in sync, and they render identically on every device.
 */
export const AVATAR_PRESETS = {
  // ── Team-flavored (see TEAM_PRESET_IDS) ──
  slipper:   { emoji: '👠', bg: '#DC2626', label: 'Glass slipper' },
  carriage:  { emoji: '🎃', bg: '#EA580C', label: 'Carriage' },
  taco:      { emoji: '🌮', bg: '#CA8A04', label: 'Taco' },
  wrench:    { emoji: '🔧', bg: '#2563EB', label: 'Wrench' },
  racecar:   { emoji: '🏎️', bg: '#1D4ED8', label: 'Hot rod' },
  pony:      { emoji: '🐴', bg: '#16A34A', label: 'Pony' },
  carousel:  { emoji: '🎠', bg: '#15803D', label: 'Carousel' },
  kangaroo:  { emoji: '🦘', bg: '#7C3AED', label: 'Kangaroo' },
  water:     { emoji: '💧', bg: '#0EA5E9', label: 'CEO of Water' },
  cereal:    { emoji: '🥣', bg: '#EA580C', label: 'Cream of Wheaton' },
  wheat:     { emoji: '🌾', bg: '#B45309', label: 'Wheat' },
  pan:       { emoji: '🍳', bg: '#CA8A04', label: 'Pots n Pans' },
  chef:      { emoji: '👨‍🍳', bg: '#A16207', label: 'Chef' },
  icecream:  { emoji: '🍦', bg: '#BE185D', label: 'Soft serve' },
  pie:       { emoji: '🥧', bg: '#9D174D', label: 'Pie' },
  moon:      { emoji: '🌙', bg: '#0891B2', label: 'Shoot the moon' },
  rocket:    { emoji: '🚀', bg: '#0E7490', label: 'Rocket' },
  cactus:    { emoji: '🌵', bg: '#4338CA', label: 'Mojave' },
  cat:       { emoji: '🐈', bg: '#3730A3', label: 'Cat' },
  sword:     { emoji: '⚔️', bg: '#0D9488', label: 'Meta Knight' },
  shield:    { emoji: '🛡️', bg: '#0F766E', label: 'Shield' },
  clapper:   { emoji: '🎬', bg: '#14B8A6', label: 'The Replacements' },
  elephant:  { emoji: '🐘', bg: '#92400E', label: 'Elephant' },
  forest:    { emoji: '🌲', bg: '#166534', label: 'River Forest' },

  // ── Universal — offered to everybody ──
  football:  { emoji: '🏈', bg: '#7C2D12', label: 'Football' },
  belt:      { emoji: '🏆', bg: '#B45309', label: 'Trophy' },
  fire:      { emoji: '🔥', bg: '#DC2626', label: 'Fire' },
  goat:      { emoji: '🐐', bg: '#475569', label: 'GOAT' },
  skull:     { emoji: '💀', bg: '#1F2937', label: 'Skull' },
  crown:     { emoji: '👑', bg: '#A16207', label: 'Crown' },
  alien:     { emoji: '👽', bg: '#4D7C0F', label: 'Alien' },
  pizza:     { emoji: '🍕', bg: '#B91C1C', label: 'Pizza' },
  brain:     { emoji: '🧠', bg: '#BE185D', label: 'Big brain' },
  clown:     { emoji: '🤡', bg: '#7C3AED', label: 'Clown' },
  trash:     { emoji: '🗑️', bg: '#374151', label: 'Dumpster' },
  rocket2:   { emoji: '📈', bg: '#15803D', label: 'Stonks' },
}

/** Offered to every team, after their own flavored set. */
export const UNIVERSAL_PRESET_IDS = [
  'football', 'belt', 'fire', 'goat', 'skull', 'crown',
  'alien', 'pizza', 'brain', 'clown', 'trash', 'rocket2',
]

/**
 * Team-specific picks, drawn from each franchise's actual identity — the
 * ESPN team name, the abbrev, or the long-running joke behind it.
 */
export const TEAM_PRESET_IDS = {
  'A. Zurek': ['slipper', 'carriage', 'taco'],   // Cinderella Story / TACO
  Abad:       ['wrench', 'racecar'],             // Horner Park Johnson-Rods
  Bill:       ['pony', 'carousel'],              // bill pony club
  Cantone:    ['kangaroo', 'water'],             // Aussie Rookie Ramblers / CEO OF WATER
  Dugan:      ['cereal', 'wheat'],               // Cream Of Wheaton
  Faybik:     ['pan', 'chef'],                   // Allegiant Pots N Pans
  Foley:      ['icecream', 'pie'],               // Wheaton Creampeyes
  Jared:      ['moon', 'rocket'],                // Shoot the Moon: IV
  Jason:      ['cactus', 'cat'],                 // The Mojave Miracles / CATS
  'M. Zurek': ['sword', 'shield'],               // Meta Knights
  Ryan:       ['clapper'],                       // The Replacements
  Wayne:      ['elephant', 'forest'],            // River Forest Republicans
}

/** Preset ids to offer this team: their flavored set first, then the universals. */
export function presetsForTeam(teamName) {
  const own = TEAM_PRESET_IDS[teamName] ?? []
  const seen = new Set(own)
  return [...own, ...UNIVERSAL_PRESET_IDS.filter((id) => !seen.has(id))]
    .filter((id) => AVATAR_PRESETS[id])
    .map((id) => ({ id, ...AVATAR_PRESETS[id] }))
}

/** Colored-initials fallback, matching the pre-existing TeamAvatar behavior. */
export function initialsFor(name) {
  return String(name ?? '')
    .replace('.', '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
}

/**
 * What should we actually draw for this team?
 *
 * @param teamName  the team
 * @param avatarDoc that team's teamAvatars doc (or null/undefined)
 * @param team      the staticData entry (for `.logo` and `.color`)
 * @returns {kind:'image',src} | {kind:'preset',emoji,bg} | {kind:'initials',text,bg}
 */
export function resolveAvatar(teamName, avatarDoc, team) {
  if (avatarDoc?.dataUrl) return { kind: 'image', src: avatarDoc.dataUrl }

  const preset = avatarDoc?.presetId ? AVATAR_PRESETS[avatarDoc.presetId] : null
  if (preset) return { kind: 'preset', emoji: preset.emoji, bg: preset.bg }

  if (team?.logo) return { kind: 'image', src: team.logo }

  return { kind: 'initials', text: initialsFor(teamName), bg: team?.color ?? 'var(--iff-elevated)' }
}

// ── Upload path (browser only — needs canvas) ──────────────────

export const AVATAR_PX = 256
/** Firestore's hard doc ceiling is 1MiB; stay far under it. */
export const MAX_AVATAR_BYTES = 240 * 1024

/**
 * Center-crop + downscale an image File to a square JPEG data URL.
 * Steps quality down if the first pass is still too heavy, so an enormous
 * phone photo can't produce a document Firestore will reject.
 */
export async function fileToAvatarDataUrl(file, px = AVATAR_PX) {
  const bitmap = await loadBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')

  // Cover-crop: fill the square from the image's center, never letterbox.
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, px, px)
  bitmap.close?.()

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(url) <= MAX_AVATAR_BYTES) return url
  }
  throw new Error('That image is too large even after compressing — try a smaller one.')
}

/** Approximate decoded byte length of a data URL (base64 is 4/3 of the bytes). */
export function dataUrlBytes(dataUrl) {
  const i = String(dataUrl).indexOf(',')
  if (i < 0) return 0
  const b64 = dataUrl.slice(i + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file)
  // Safari fallback
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')) }
    img.src = url
  })
}
