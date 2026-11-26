// tree — the "who made whom" page, rewritten after every step of a build.
// Open out/contractor/build/tree.html while the contractor runs; it
// refreshes itself until the build stops.
import { MAX_HIRES } from './checks.mjs'

const WORD = {
  hired: 'Hired', working: 'Working…', passed: 'Passed', retry: 'Trying again…', failed: 'Failed',
  fixing: 'Fixing…', leading: 'Waiting on its helpers…',
}
const STATE = { building: 'Building…', planned: 'Planned — not built yet', done: 'Finished', stopped: 'Stopped', declined: 'Not buildable' }

const CSS = `
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d1d1b;--dim:#6b6a65;--line:#d9d6cd;--ok:#1f7a4d;--bad:#b3261e;--busy:#9a6700;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--card:#21211e;--ink:#eeece5;--dim:#a3a098;--line:#3a3934;--ok:#5fca93;--bad:#ff8a80;--busy:#e3b341;--accent:#91a7ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px}h1{font-size:26px;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 18px}.bar{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;margin:0 0 26px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px}
.bar b{font-variant-numeric:tabular-nums}a{color:var(--accent)}.go{margin-left:auto;font-weight:600}
.level{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.one{max-width:320px}
.link{height:22px;border-left:2px solid var(--line);margin-left:28px}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:10px;padding:12px 14px}
.card h3{margin:0 0 2px;font-size:16px}.role{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.card p{margin:6px 0 0;font-size:14px;color:var(--dim);overflow-wrap:anywhere}.st{font-weight:600;font-size:14px;margin-top:8px}
.passed{border-left-color:var(--ok)}.passed .st{color:var(--ok)}.failed{border-left-color:var(--bad)}.failed .st{color:var(--bad)}
.working,.retry,.fixing,.leading{border-left-color:var(--busy)}.working .st,.retry .st,.fixing .st,.leading .st{color:var(--busy)}
.helpers{margin-left:28px;padding-left:18px;border-left:2px solid var(--line)}.tag{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:99px;padding:0 7px;margin-left:6px;color:var(--dim);vertical-align:middle}
.note{color:var(--bad)!important}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:0 0 8px}
ol{padding-left:20px;color:var(--dim);font-size:14px;overflow-wrap:anywhere}
`

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const clip = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n)}…` : String(s ?? ''))

function card(a) {
  const meta = [`made by the ${a.madeBy}`]
  if (a.area) meta.push(`area: ${a.area}`)
  if (a.tries > 1) meta.push(`${a.tries} sessions`)
  if (a.secs) meta.push(`${a.secs}s`)
  if (a.cost) meta.push(`$${a.cost.toFixed(2)}`)
  return [
    `<div class="card ${e(a.status)}"><div class="role">${e(a.role)}${a.lead ? '<span class="tag">lead</span>' : ''}</div><h3>${e(a.name)}</h3>`,
    a.job ? `<p>${e(clip(a.job, 170))}</p>` : '',
    `<div class="st">${e(WORD[a.status] ?? a.status)}</div><p>${e(meta.join(' · '))}</p>`,
    a.note ? `<p class="note">${e(clip(a.note, 240))}</p>` : '',
    a.summary && a.status === 'passed' ? `<p>${e(clip(a.summary, 240))}</p>` : '',
    `<p><a href="crew/${e(a.id)}/brief.md">its brief</a></p></div>`,
  ].join('')
}

export function treeHtml(state) {
  const agents = state.agents ?? []
  const by = (role) => agents.filter((a) => a.role === role)
  const cost = agents.reduce((n, a) => n + (a.cost ?? 0), 0)
  const live = state.status === 'building'
  const rows = ['<div class="level one"><div class="card passed"><div class="role">you run this</div><h3>Contractor</h3>'
    + '<p>Hires, checks, commits, opens the pull request. Writes no app code.</p><div class="st">ops/graph/contractor.mjs</div></div></div>']
  for (const [title, role] of [['Hired by the contractor', 'architect'], ['Defined by the architect, hired by the contractor', 'trade'], ['Hired by the contractor', 'inspector']]) {
    const group = by(role)
    if (group.length) rows.push(`<div class="link"></div><h2>${title}</h2><div class="level${role === 'trade' ? '' : ' one'}">${group.map(card).join('')}</div>`)
    for (const lead of role === 'trade' ? group : []) {
      const mine = agents.filter((a) => a.role === 'helper' && a.leadId === lead.id)
      if (mine.length) rows.push(`<div class="link"></div><div class="helpers"><h2>Defined by the ${e(lead.id)} trade (a lead), hired by the contractor</h2><div class="level">${mine.map(card).join('')}</div></div>`)
    }
  }
  const pr = state.pr?.url ? `<a class="go" href="${e(state.pr.url)}">Open the pull request →</a>` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${live ? '<meta http-equiv="refresh" content="3">' : ''}<title>IFFL contractor</title><style>${CSS}</style></head>
<body><main><h1>${e(state.title || 'IFFL contractor')}</h1><p class="sub">${e(state.request)}</p>
<div class="bar"><span>Status: <b>${e(STATE[state.status] ?? state.status)}</b></span><span>Hires: <b>${agents.length} of ${MAX_HIRES}</b></span><span>Usage (list-price estimate, not a charge): <b>$${cost.toFixed(2)}</b></span>${pr}</div>
${rows.join('\n')}
<div class="link" style="border:0"></div><h2>What happened, in order</h2><ol>${(state.log ?? []).slice(-60).map((l) => `<li>${e(l)}</li>`).join('')}</ol>
</main></body></html>
`
}
