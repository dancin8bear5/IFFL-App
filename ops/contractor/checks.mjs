// checks — what the contractor's crew may be and may touch.
//
// The contractor hires Claude sessions and none of them is trusted. Every
// answer a hire gives — the architect's blueprint, a lead's request for
// helpers, a trade's finished change — is judged HERE, by code, before it is
// used. A rule that lives only in a brief is a suggestion.
//
// Unlike a scout (which may touch the browser app only), the contractor
// builds what the commissioner ASKED for, so it may reach further: server
// functions, scripts, security rules, docs. What it still cannot touch is
// anything that runs by itself on the Mac, how the app deploys, what it
// depends on, secrets, and the league's committed history.

export const CAPS = {
  trades: 6, // trades and helpers together
  helpers: 2, // per lead
  leads: 1,
  maxFiles: 30,
  maxLines: 2000,
}
// + the architect and the inspector. The contractor itself is not a hire.
export const MAX_HIRES = CAPS.trades + 2

/** Each trade works in ONE area. `tests` is what the contractor runs after it. */
export const AREAS = {
  web: { label: 'the browser app', allow: [/^web\/src\//, /^web\/e2e\//, /^web\/public\//], tests: ['web-test'] },
  functions: { label: 'server functions', allow: [/^functions\/[^/]+\.(js|json)$/, /^functions\/scripts\//], tests: ['functions-test'] },
  scripts: { label: 'data scripts', allow: [/^web\/scripts\//], tests: [] },
  rules: { label: 'security rules', allow: [/^firestore\.rules$/, /^firestore\.indexes\.json$/, /^tests\/rules\/[^/]+\.m?js$/], tests: [] },
  docs: { label: 'notes and docs', allow: [/^docs\//, /^CLAUDE\.md$/], tests: [] },
}

const NEVER = [
  [/^\.github\//, 'how the app deploys'],
  [/^ops\//, 'jobs that run on the Mac'],
  [/^data\//, "the league's committed history"],
  [/(^|\/)\.env/, 'environment files'],
  [/(^|\/)package(-lock)?\.json$/, 'dependencies'],
  [/(^|\/)node_modules\//, 'installed packages'],
  [/\.(pem|p8|p12|key|plist)$/, 'keys and schedules'],
  [/^(firebase\.json|\.firebaserc)$/, 'Firebase project setup'],
  [/^web\/src\/data\/powerRankings\d*\.json$/, 'unreleased rankings text'],
  [/serviceAccount|GoogleService-Info/, 'credentials'],
]

// Allowed, but the commissioner should know before he merges.
const FLAGS = [
  [/^firestore\.(rules|indexes\.json)$/, 'Changes who can read or write league data (security rules). They go live on the next deploy.'],
  [/^functions\//, 'Changes server functions. They go live on the next deploy.'],
  [/^web\/src\/(context\/|firebase)/, 'Changes sign-in or app start-up.'],
  [/^web\/src\/services\/firestoreService\.js$/, 'Changes how the app reads and writes the database.'],
  [/^web\/src\/views\/(AdminView|LoginView)\.jsx$/, 'Changes the Admin or sign-in screen.'],
  [/^web\/scripts\//, 'Adds or changes a script. Nothing has run it — you run scripts by hand.'],
]

const ID = /^[a-z][a-z0-9-]{1,30}$/
const RESERVED = new Set(['architect', 'inspector', 'contractor'])
const text = (v, min = 5) => typeof v === 'string' && v.trim().length >= min

/** Why the architect's blueprint cannot be used. [] means it can. */
export function blueprintProblems(bp) {
  if (!bp || typeof bp !== 'object') return ['the blueprint is not an object']
  if (bp.buildable === false) return text(bp.reason) ? [] : ['buildable is false but no reason was given']
  const out = []
  for (const k of ['title', 'summary', 'contract']) if (!text(bp[k])) out.push(`missing '${k}'`)
  if (!Array.isArray(bp.acceptance) || !bp.acceptance.some((a) => text(a))) out.push("missing 'acceptance' (how to check it worked)")
  const trades = bp.trades
  if (!Array.isArray(trades) || !trades.length) return [...out, 'needs at least 1 trade']
  const ids = new Set()
  let leads = 0
  trades.forEach((t, i) => {
    if (!t || typeof t !== 'object') { out.push(`trade ${i + 1} is not an object`); return }
    const id = String(t.id ?? '')
    if (!ID.test(id) || RESERVED.has(id)) out.push(`trade ${i + 1} has a bad id '${id}'`)
    if (ids.has(id)) out.push(`two trades share the id '${id}'`)
    ids.add(id)
    if (!AREAS[t.area]) out.push(`trade '${id}': area must be one of ${Object.keys(AREAS).join(', ')}`)
    for (const k of ['name', 'job']) if (!text(t[k])) out.push(`trade '${id}': missing '${k}'`)
    if (t.lead != null && typeof t.lead !== 'boolean') out.push(`trade '${id}': "lead" must be true or false`)
    if (t.lead) leads++
  })
  if (leads > CAPS.leads) out.push(`${leads} lead trades — at most ${CAPS.leads}`)
  const size = trades.length + CAPS.helpers * leads
  if (size > CAPS.trades) out.push(`${trades.length} trades${leads ? ` plus ${CAPS.helpers} helpers for the lead` : ''} is over the cap of ${CAPS.trades}`)
  return out
}

/** Why a lead's request for helpers cannot be granted. [] means it can. */
export function planProblems(plan, taken, leadId) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.helpers)) return ['the answer must be {"glue": "...", "helpers": [...]}']
  const hs = plan.helpers
  if (hs.length < 1 || hs.length > CAPS.helpers) return [`ask for 1 to ${CAPS.helpers} helpers (you asked for ${hs.length})`]
  const out = []
  const seen = new Set()
  hs.forEach((h, i) => {
    if (!h || typeof h !== 'object') { out.push(`helper ${i + 1} is not an object`); return }
    const id = String(h.id ?? '')
    if (!/^[a-z][a-z0-9]{1,20}$/.test(id)) out.push(`helper ${i + 1} has a bad id '${id}' (lowercase letters and digits only)`)
    if (seen.has(id) || taken.has(`${leadId}-${id}`)) out.push(`the helper id '${id}' is already used`)
    seen.add(id)
    for (const k of ['name', 'job']) if (!text(h[k])) out.push(`helper '${id}': missing '${k}'`)
  })
  return out
}

/**
 * Why a change cannot be kept. [] means it can.
 * @param files [{path, added, deleted, status}]  from policy.parseGitDiff
 * @param area  the trade's area, or null to judge a whole build across every area
 */
export function diffProblems(files, area = null, { allowEmpty = false } = {}) {
  const list = files ?? []
  if (!list.length) return allowEmpty ? [] : ['no changes were made']
  const out = []
  const allowed = area ? AREAS[area].allow : Object.values(AREAS).flatMap((a) => a.allow)
  for (const f of list) {
    const p = String(f.path ?? '')
    if (p.includes('..') || p.startsWith('/')) { out.push(`${p}: path escapes the repo`); continue }
    const never = NEVER.find(([re]) => re.test(p))
    if (never) { out.push(`${p}: off limits (${never[1]})`); continue }
    if (!allowed.some((re) => re.test(p))) {
      out.push(area ? `${p}: outside this trade's area (${area} — ${AREAS[area].label})` : `${p}: outside every area the crew may work in`)
      continue
    }
    if (f.status === 'D') out.push(`${p}: the crew may not delete files`)
    if (/\.test\.m?js$/.test(p) && f.status === 'M' && (f.deleted ?? 0) > (f.added ?? 0)) out.push(`${p}: an existing test lost more lines than it gained`)
  }
  if (list.length > CAPS.maxFiles) out.push(`${list.length} files changed (max ${CAPS.maxFiles})`)
  const lines = list.reduce((n, f) => n + (f.added ?? 0) + (f.deleted ?? 0), 0)
  if (lines > CAPS.maxLines) out.push(`${lines} lines changed (max ${CAPS.maxLines})`)
  return out
}

/** Plain-English warnings for the pull request: allowed, but look first. */
export function flags(files) {
  return FLAGS.filter(([re]) => (files ?? []).some((f) => re.test(String(f.path ?? '')))).map(([, why]) => why)
}

/** Which test runs a finished build needs. */
export function finalTests(files) {
  const touched = (area) => (files ?? []).some((f) => AREAS[area].allow.some((re) => re.test(String(f.path ?? ''))))
  return ['web-test', 'web-build', ...(touched('functions') ? ['functions-test'] : [])]
}

/** Why the inspector's report cannot be used. [] means it can. */
export function reportProblems(rep, tradeIds) {
  if (!rep || typeof rep !== 'object' || typeof rep.pass !== 'boolean' || !Array.isArray(rep.problems)) {
    return ['the report must be {"pass": true|false, "problems": [...]}']
  }
  return rep.problems.filter((p) => !p || !tradeIds.has(p.trade) || !text(p.problem)).map((p) => `a problem names an unknown trade '${p?.trade}' or has no description`)
}

/** "Add a playoff odds tile!" → "add-a-playoff-odds-tile" */
export function slug(request, max = 40) {
  const s = String(request ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (s.slice(0, max).replace(/-+$/, '') || 'build')
}
