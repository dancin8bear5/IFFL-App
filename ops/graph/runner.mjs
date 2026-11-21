// runner — a small graph runner for the Mac-side jobs.
//
// A job used to be a shell script: do A, then B, then C, and if B fails the
// whole thing stops and next time starts again from A. A graph says what
// each step NEEDS instead of what comes before it, and three things follow:
//
//   • steps with no dependency on each other run side by side;
//   • one branch failing does not stop its siblings;
//   • the run's state is saved after every step, so a re-run RESUMES —
//     finished steps are not repeated.
//
// A node:
//   { id,                     unique
//     needs: ['a', 'b'],      ids that must finish first
//     run: async (ctx) => v,  the work; its return value is stored and
//                             readable by later nodes as ctx.results[id]
//     optional: true,         a failure is recorded but does not block
//                             the nodes that need this one
//     always: true,           re-run on resume even if it finished before
//                             (checks whose answer can go stale)
//     retry: (err, attempt) => waitMs | null    try again after waitMs, or stop }
//
// No dependencies, and nothing here knows about ESPN or Firestore — the
// graphs do (see tuesday.mjs).

export const STATUS = { done: 'done', failed: 'failed', blocked: 'blocked' }

/** Throws on a graph that could never run: duplicate ids, unknown needs, a cycle. */
export function validate(nodes) {
  const ids = new Set()
  for (const n of nodes) {
    if (!n?.id || typeof n.run !== 'function') throw new Error('every node needs an id and a run()')
    if (ids.has(n.id)) throw new Error(`duplicate node id '${n.id}'`)
    ids.add(n.id)
  }
  for (const n of nodes) {
    for (const d of n.needs ?? []) if (!ids.has(d)) throw new Error(`node '${n.id}' needs unknown node '${d}'`)
  }
  levels(nodes) // throws on a cycle
  return true
}

/** Nodes grouped into waves: everything in a wave can run at the same time. */
export function levels(nodes) {
  const placed = new Set()
  const out = []
  let left = [...nodes]
  while (left.length) {
    const wave = left.filter((n) => (n.needs ?? []).every((d) => placed.has(d)))
    if (!wave.length) throw new Error(`cycle among: ${left.map((n) => n.id).join(', ')}`)
    out.push(wave.map((n) => n.id))
    for (const n of wave) placed.add(n.id)
    left = left.filter((n) => !placed.has(n.id))
  }
  return out
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Run (or resume) a graph.
 * @param nodes
 * @param opts.state  a previous run's state ({nodes: {id: {status, value, error, attempts}}}) to resume from
 * @param opts.save   async (state) => void, called after every node settles
 * @param opts.ctx    anything the nodes need; `results` is added to it
 * @param opts.log    (line) => void
 * @param opts.sleep  injectable for tests
 * @returns {ok, state} — ok only if every non-optional node finished
 */
export async function runGraph(nodes, { state, save = async () => {}, ctx = {}, log = () => {}, sleep = sleepFor } = {}) {
  validate(nodes)
  const st = { startedAt: state?.startedAt ?? new Date().toISOString(), nodes: { ...(state?.nodes ?? {}) } }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const results = {}

  // Resume: keep what finished. Anything that failed, was blocked, or must
  // always re-run starts clean.
  for (const n of nodes) {
    const prev = st.nodes[n.id]
    if (prev?.status === STATUS.done && !n.always) results[n.id] = prev.value
    else delete st.nodes[n.id]
  }
  const settled = (id) => st.nodes[id]?.status
  // A dependency is satisfied when it finished — or failed but was optional.
  const satisfied = (id) => settled(id) === STATUS.done || (settled(id) === STATUS.failed && byId.get(id).optional)
  const dead = (id) => settled(id) === STATUS.blocked || (settled(id) === STATUS.failed && !byId.get(id).optional)

  async function runNode(n) {
    for (let attempt = 1; ; attempt++) {
      try {
        const value = await n.run({ ...ctx, results })
        results[n.id] = value ?? null
        st.nodes[n.id] = { status: STATUS.done, value: value ?? null, attempts: attempt, at: new Date().toISOString() }
        log(`✓ ${n.id}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
        return
      } catch (e) {
        const wait = n.retry ? n.retry(e, attempt) : null
        if (wait == null) {
          st.nodes[n.id] = { status: STATUS.failed, error: String(e.message ?? e).slice(0, 500), attempts: attempt, at: new Date().toISOString() }
          log(`✗ ${n.id}: ${st.nodes[n.id].error}`)
          return
        }
        log(`… ${n.id} failed (${String(e.message ?? e).slice(0, 120)}); retrying in ${Math.round(wait / 60000)} min`)
        await sleep(wait)
      }
    }
  }

  for (;;) {
    // Mark what can no longer run because something it needs is dead.
    for (const n of nodes) {
      if (!settled(n.id) && (n.needs ?? []).some(dead)) {
        st.nodes[n.id] = { status: STATUS.blocked, error: `blocked by ${(n.needs ?? []).filter(dead).join(', ')}` }
        log(`– ${n.id}: ${st.nodes[n.id].error}`)
      }
    }
    const ready = nodes.filter((n) => !settled(n.id) && (n.needs ?? []).every(satisfied))
    if (!ready.length) break
    await Promise.all(ready.map(runNode))
    await save(st)
  }
  await save(st)
  const ok = nodes.every((n) => settled(n.id) === STATUS.done || (n.optional && settled(n.id) !== undefined))
  return { ok, state: st, results }
}
