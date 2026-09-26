// historyTable — generic search, filter, sort and export over declared rows.
//
// The History page has six categories with nothing in common: an auction
// pick and a playoff game share no fields. Writing six screens would mean
// six search boxes, six sort implementations and six export buttons to keep
// in step, and the seventh category would cost the same again.
//
// Instead each category DECLARES its columns, and everything else is
// derived: which fields the search box reads, which controls the filter bar
// shows, what the table renders, and what the export writes. Adding a
// category is one declaration and no new UI.
//
// A column looks like:
//   { key, label, type: 'text' | 'number' | 'season',
//     search: true,            // include in the free-text index
//     filter: 'select' | 'range',
//     align: 'right', width, format(v, row) }
//
// Pure and tested — the page renders only what these return.

const lower = (v) => String(v ?? '').toLowerCase()

/** Columns the free-text box reads. */
export const searchableKeys = (columns = []) => columns.filter((c) => c.search).map((c) => c.key)

/**
 * One lowercase string per row, built once when the rows arrive rather
 * than per keystroke. Player Scores is 32,000 rows; rebuilding those on
 * every character is the difference between instant and unusable.
 */
export function indexRows(rows = [], columns = []) {
  const keys = searchableKeys(columns)
  return rows.map((r) => ({ ...r, _hay: keys.map((k) => lower(r[k])).join(' ') }))
}

export function tokenize(text) {
  return lower(text).split(/[\s,]+/).filter(Boolean)
}

/** Every term must appear — more words narrow, never widen. */
export function matchesText(row, terms) {
  if (terms.length === 0) return true
  const hay = row._hay ?? ''
  return terms.every((t) => hay.includes(t))
}

/**
 * Distinct values for a select filter, ready for an <option> list.
 * Numbers sort high-to-low (seasons read newest first); text sorts A-Z.
 */
export function optionsFor(rows = [], column) {
  const seen = new Set()
  for (const r of rows) {
    const v = r[column.key]
    if (v === null || v === undefined || v === '') continue
    seen.add(v)
  }
  const vals = [...seen]
  return column.type === 'number' || column.type === 'season'
    ? vals.sort((a, b) => Number(b) - Number(a))
    : vals.sort((a, b) => String(a).localeCompare(String(b)))
}

/**
 * Apply the whole filter bar.
 *
 * @param filters - { [key]: value } for selects, { [key]: {min,max} } for ranges.
 *   An empty string, null or an empty range means "don't filter on this",
 *   so a control the user hasn't touched never removes rows.
 */
export function applyFilters(rows = [], columns = [], filters = {}) {
  const active = columns
    .map((c) => [c, filters[c.key]])
    .filter(([c, v]) => {
      if (v === undefined || v === null || v === '') return false
      if (c.filter === 'range') return v.min !== '' && v.min != null || v.max !== '' && v.max != null
      return true
    })
  if (active.length === 0) return rows
  return rows.filter((r) => active.every(([c, v]) => {
    if (c.filter === 'range') {
      const raw = r[c.key]
      // Check the raw value before converting: Number(null) is 0, so a row
      // with no price would otherwise pass every "under $5" filter and
      // quietly corrupt the answer.
      if (raw === null || raw === undefined || raw === '') return false
      const n = Number(raw)
      if (!Number.isFinite(n)) return false
      if (v.min !== '' && v.min != null && n < Number(v.min)) return false
      if (v.max !== '' && v.max != null && n > Number(v.max)) return false
      return true
    }
    return String(r[c.key] ?? '') === String(v)
  }))
}

/**
 * Sort by one column.
 *
 * Numbers compare numerically and text alphabetically, because a season
 * column sorted as text puts 2009 after 2010. Blanks always sink to the
 * bottom whichever way the sort runs — a missing value is not "smallest",
 * it's absent, and floating them to the top on every descending sort would
 * bury the rows someone actually asked to see.
 */
export function sortRows(rows = [], columns = [], sort) {
  if (!sort?.key) return rows
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  const numeric = col.type === 'number' || col.type === 'season'
  const blank = (v) => v === null || v === undefined || v === ''
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key]
    if (blank(x) && blank(y)) return 0
    if (blank(x)) return 1
    if (blank(y)) return -1
    const cmp = numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y))
    return cmp * dir
  })
}

/**
 * The whole pipeline, in the order that keeps it cheap: filters cut the
 * row count first, then the text scan runs over what survives, then only
 * the survivors get sorted.
 */
export function queryRows(rows = [], columns = [], { text = '', filters = {}, sort = null } = {}) {
  const filtered = applyFilters(rows, columns, filters)
  const terms = tokenize(text)
  const matched = terms.length ? filtered.filter((r) => matchesText(r, terms)) : filtered
  return sortRows(matched, columns, sort)
}

// ── export ────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  // Quote anything that would otherwise break the row apart, and double
  // any quote inside it — "Ja'Marr" is fine, `Smith, Jr.` is not.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Rows to CSV using the declared columns, so the export always matches
 * the table it came from — same columns, same order, same formatting.
 */
export function toCSV(rows = [], columns = []) {
  const cols = columns.filter((c) => c.export !== false)
  const head = cols.map((c) => csvCell(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => csvCell(c.format ? c.format(r[c.key], r) : r[c.key])).join(','))
  return [head, ...body].join('\n') + '\n'
}

/**
 * A filename that says what the file holds, so a folder of exports is
 * still readable a month later.
 */
export function exportFilename(category, { text = '', filters = {}, scope = 'results' } = {}) {
  const bits = ['iffl', category]
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'object') {
      const r = [v.min, v.max].filter((x) => x !== '' && x != null).join('-')
      if (r) bits.push(`${k}${r}`)
    } else bits.push(String(v))
  }
  if (text.trim()) bits.push(text.trim().replace(/\s+/g, '-'))
  if (scope === 'all') bits.push('all')
  return `${bits.join('-').replace(/[^A-Za-z0-9._-]/g, '').toLowerCase()}.csv`
}

/**
 * Hand the browser a file. Kept here so the page never touches the DOM
 * directly and the whole export path stays in one testable place.
 */
export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
