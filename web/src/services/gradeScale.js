// gradeScale — the league's letter grades as numbers, for sorting.
//
// Alphabetical sorting is WRONG for grades and wrong in a way that looks
// almost right, which is why this exists. "A+" < "A" < "A-" by string
// comparison ('+' is 43, '-' is 45, and "A" is shorter than both), so an
// alphabetical Verdict column puts A above A+ and buries the best team in
// the middle. The scale below is the league's own, from the grading model
// in the Power Rankings handoff.
//
// Bench/Owner is two grades in one column, so it sorts on the mean of the
// pair — the honest summary of a cell that shows "D / B".

export const GRADE_POINTS = {
  'A+': 4.0, A: 3.7, 'A-': 3.4,
  'B+': 3.0, B: 2.7, 'B-': 2.4,
  'C+': 2.0, C: 1.7, 'C-': 1.4,
  'D+': 1.0, D: 0.7, 'D-': 0.4,
  F: 0,
}

/**
 * A grade's point value. Tolerates the real data: a trailing note like
 * "B (with Watson)" grades as its letter, and the payload's hyphen and a
 * pasted en/em dash all mean minus.
 */
export function gradeValue(grade) {
  if (grade == null) return null
  const key = String(grade)
    .trim()
    .split(/\s/)[0]                    // "B (with Watson)" → "B"
    .replace(/[‐-―−]/g, '-')  // any dash → hyphen
    .toUpperCase()
  return key in GRADE_POINTS ? GRADE_POINTS[key] : null
}

/** The mean of two grades, for the combined Bench/Owner column. */
export function pairValue(a, b) {
  const x = gradeValue(a)
  const y = gradeValue(b)
  if (x == null && y == null) return null
  if (x == null) return y
  if (y == null) return x
  return (x + y) / 2
}
