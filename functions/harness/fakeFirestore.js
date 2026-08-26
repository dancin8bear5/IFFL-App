// fakeFirestore — an in-memory stand-in for the Admin SDK's Firestore,
// just rich enough to run the real trade pipeline offline.
//
// Why this exists: the parts of the trade flow most worth testing are the
// orchestration steps — dedupe on sourceId, roster matching, the reconcile
// hold, the asset transfer, and the accept→execute→completed hop. None of
// them are reachable through the wrapped Cloud Function triggers without a
// live Firestore, and the Firestore emulator needs a Java runtime this
// machine doesn't have. So the code under test is the real code; only the
// database beneath it is swapped.
//
// Deliberately NOT a general Firestore implementation. It supports exactly
// the operations index.js performs, and throws loudly on anything else so a
// future query silently returning [] can't masquerade as a passing test.

class FakeTimestamp {
  constructor(ms) { this._ms = ms }
  static now() { return new FakeTimestamp(Date.now()) }
  static fromMillis(ms) { return new FakeTimestamp(ms) }
  static fromDate(d) { return new FakeTimestamp(d.getTime()) }
  toMillis() { return this._ms }
  toDate() { return new Date(this._ms) }
  valueOf() { return this._ms }
}

const ARRAY_UNION = Symbol('arrayUnion')
const FieldValue = {
  arrayUnion: (...vals) => ({ [ARRAY_UNION]: vals }),
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => x)))

/** Apply a write, resolving arrayUnion sentinels against the current doc. */
function materialize(existing, patch) {
  const out = { ...(existing ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && ARRAY_UNION in v) {
      const cur = Array.isArray(out[k]) ? out[k] : []
      const add = v[ARRAY_UNION].filter((x) => !cur.includes(x))
      out[k] = [...cur, ...add]
    } else {
      out[k] = v
    }
  }
  return out
}

class FakeFirestore {
  constructor(seed = {}) {
    // store: { collectionName: Map(docId -> data) }
    this.store = new Map()
    for (const [col, docs] of Object.entries(seed)) {
      this.store.set(col, new Map(Object.entries(docs)))
    }
    this.writeLog = []
  }

  _col(name) {
    if (!this.store.has(name)) this.store.set(name, new Map())
    return this.store.get(name)
  }

  /** Every document in a collection, as {id, ...data}. Test helper. */
  dump(col) {
    return [...this._col(col).entries()].map(([id, d]) => ({ id, ...d }))
  }

  get(col, id) {
    const d = this._col(col).get(id)
    return d ? { id, ...d } : null
  }

  collection(name) { return new FakeCollection(this, name) }

  doc(path) {
    const [col, id, ...rest] = path.split('/')
    if (rest.length) throw new Error(`fakeFirestore: subcollections unsupported (${path})`)
    return new FakeDoc(this, col, id)
  }

  /**
   * Transactions here are NOT isolated — they run the callback immediately
   * against live state. That's fine for the properties under test (ordering
   * and the guard re-read), and the alternative would be pretending to
   * offer a concurrency guarantee this harness cannot actually make.
   */
  async runTransaction(fn) {
    const tx = {
      get: async (ref) => ref.get(),
      set: (ref, data) => { ref._write(data, 'set') },
      update: (ref, data) => { ref._write(data, 'update') },
    }
    return fn(tx)
  }
}

class FakeDoc {
  constructor(fs, col, id) {
    this.fs = fs
    this.col = col
    this.id = id ?? `auto-${col}-${fs._col(col).size + 1}-${fs.writeLog.length}`
  }

  async get() {
    const data = this.fs._col(this.col).get(this.id)
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => (data === undefined ? undefined : clone(data)),
      ref: this,
    }
  }

  _write(data, kind) {
    const map = this.fs._col(this.col)
    if (kind === 'update' && !map.has(this.id)) {
      throw new Error(`fakeFirestore: update on missing doc ${this.col}/${this.id}`)
    }
    map.set(this.id, materialize(map.get(this.id), data))
    this.fs.writeLog.push({ col: this.col, id: this.id, kind, data })
  }

  async set(data) { this._write(data, 'set'); return this }
  async update(data) { this._write(data, 'update'); return this }
}

class FakeCollection {
  constructor(fs, name, filters = []) {
    this.fs = fs
    this.name = name
    this.filters = filters
  }

  doc(id) { return new FakeDoc(this.fs, this.name, id) }

  where(field, op, value) {
    if (!['==', 'in', '>='].includes(op)) {
      throw new Error(`fakeFirestore: unsupported operator "${op}" on ${this.name}.${field}`)
    }
    return new FakeCollection(this.fs, this.name, [...this.filters, { field, op, value }])
  }

  async get() {
    const rows = [...this.fs._col(this.name).entries()]
      .map(([id, d]) => ({ id, data: d }))
      .filter(({ data }) =>
        this.filters.every(({ field, op, value }) => {
          const actual = data[field]
          if (op === '==') return actual === value
          if (op === 'in') return Array.isArray(value) && value.includes(actual)
          if (op === '>=') return Number(actual) >= Number(value)
          return false
        }),
      )
    return {
      empty: rows.length === 0,
      size: rows.length,
      docs: rows.map(({ id, data }) => ({
        id,
        exists: true,
        data: () => clone(data),
        ref: new FakeDoc(this.fs, this.name, id),
      })),
    }
  }
}

module.exports = { FakeFirestore, FakeTimestamp, FieldValue }
