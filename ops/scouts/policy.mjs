// policy — what a scout's change is allowed to touch.
//
// The builder is an agent editing code unattended, so its instructions say
// where it may work — and this file is what actually enforces it. The graph
// runs checkDiff() on the finished change BEFORE any test, review or pull
// request; a rule that lives only in a prompt is a suggestion.
//
// The line is drawn around the BROWSER app. A scout can change how the
// league's data looks and what is computed from it on screen. It cannot
// change who may read or write that data, what the servers do, what runs
// on the Mac, how the app deploys, or what it depends on.

export const LIMITS = { maxFiles: 12, maxLines: 700 }

const ALLOW = [/^web\/src\//, /^web\/e2e\//]
const DENY = [
  [/^web\/src\/services\/firestoreService\.js$/, 'database access layer'],
  [/^web\/src\/context\//, 'app state and sign-in'],
  [/^web\/src\/firebase/, 'Firebase setup'],
  [/^web\/src\/views\/AdminView\.jsx$/, 'commissioner tools'],
  [/^web\/src\/views\/LoginView\.jsx$/, 'sign-in screen'],
  [/(^|\/)\.env/, 'environment files'],
  [/(^|\/)package(-lock)?\.json$/, 'dependencies'],
  [/\.(pem|p8|p12|key)$/, 'key material'],
]

/**
 * @param files [{path, added, deleted, status}]  status: 'A' | 'M' | 'D' | 'R'
 * @returns string[] — empty means the change is within bounds
 */
export function checkDiff(files, limits = LIMITS) {
  const out = []
  const list = files ?? []
  if (!list.length) return ['no changes were made']
  for (const f of list) {
    const p = String(f.path ?? '')
    if (p.includes('..') || p.startsWith('/')) { out.push(`${p}: path escapes the repo`); continue }
    const denied = DENY.find(([re]) => re.test(p))
    if (denied) { out.push(`${p}: off limits (${denied[1]})`); continue }
    if (!ALLOW.some((re) => re.test(p))) { out.push(`${p}: outside web/src and web/e2e`); continue }
    if (f.status === 'D') out.push(`${p}: scouts may not delete files`)
    if (/\.test\.js$/.test(p) && f.status === 'M' && (f.deleted ?? 0) > (f.added ?? 0)) {
      out.push(`${p}: an existing test lost more lines than it gained`)
    }
  }
  if (list.length > limits.maxFiles) out.push(`${list.length} files changed (max ${limits.maxFiles})`)
  const lines = list.reduce((n, f) => n + (f.added ?? 0) + (f.deleted ?? 0), 0)
  if (lines > limits.maxLines) out.push(`${lines} lines changed (max ${limits.maxLines})`)
  return out
}

/** `git diff --numstat` + `git diff --name-status` output → files. */
export function parseGitDiff(numstat, nameStatus) {
  const status = new Map()
  for (const l of String(nameStatus ?? '').split('\n').filter(Boolean)) {
    const [s, ...rest] = l.split('\t')
    status.set(rest.at(-1), s[0])
  }
  return String(numstat ?? '').split('\n').filter(Boolean).map((l) => {
    const [a, d, ...rest] = l.split('\t')
    const path = rest.join('\t').replace(/^.* => /, '')
    return { path, added: a === '-' ? 0 : Number(a), deleted: d === '-' ? 0 : Number(d), status: status.get(path) ?? 'M' }
  })
}
