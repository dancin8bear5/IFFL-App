// keeperBudgetBar — the fill % and tick % for a Worksheet year card's budget
// bar: how much of the $300 cap CEILING this year's keeper cost takes up,
// with a tick at the $200 auction budget (the planning number). Both are
// clamped 0–100 so a cost past the cap fills the bar, never overflows it.

/**
 * @param {number} cost keeper cost for the year
 * @param {{budget: number, cap: number}} opts AUCTION_BUDGET and ROSTER_CAP
 * @returns {{fillPct: number, tickPct: number}}
 */
export function keeperBudgetBar(cost, { budget, cap }) {
  const c = Number(cost) || 0
  const pct = (v) => Math.max(0, Math.min(100, (v / cap) * 100))
  return { fillPct: pct(c), tickPct: pct(budget) }
}
