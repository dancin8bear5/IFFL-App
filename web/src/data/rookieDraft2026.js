// 2026 Rookie Draft results — Keeper Master List p5 (draft held Jul 16, 2026).
// Round 1 = $2 salary, Round 2 = $1; escalation follows the standard
// +($5 × years kept) curve, so R1 runs $2 → $7 → $17 and R2 $1 → $6 → $16.
// Positions from public draft profiles; NFL teams left null (rookies landed
// after this file's sources) — fill in via Admin → Players as they're known.

const R1 = { 2026: 2, 2027: 7, 2028: 17 }
const R2 = { 2026: 1, 2027: 6, 2028: 16 }

export const rookieClass2026 = [
  // ── Round 1 ──
  { slot: '1.01', round: 1, name: 'Jeremiyah Love',      position: 'RB', team: 'Dugan' },
  { slot: '1.02', round: 1, name: 'Fernando Mendoza',    position: 'QB', team: 'Jared',    via: 'via A. Zurek, Faybik' },
  { slot: '1.03', round: 1, name: 'Jadarian Price',      position: 'RB', team: 'Cantone' },
  { slot: '1.04', round: 1, name: 'Caernell Tate',       position: 'WR', team: 'Bill',     via: 'via Ryan' },
  { slot: '1.05', round: 1, name: 'Jordyn Tyson',        position: 'WR', team: 'Foley' },
  { slot: '1.06', round: 1, name: 'Makai Lemon',         position: 'WR', team: 'Foley',    via: 'via Abad' },
  { slot: '1.07', round: 1, name: 'KC Conception',       position: 'WR', team: 'Jared' },
  { slot: '1.08', round: 1, name: 'Omar Cooper Jr.',     position: 'WR', team: 'Cantone',  via: 'via M.Zurek, Abad' },
  { slot: '1.09', round: 1, name: 'Jonah Coleman',       position: 'RB', team: 'A. Zurek', via: 'via Faybik' },
  { slot: '1.10', round: 1, name: 'Antonio Williams',    position: 'WR', team: 'A. Zurek', via: 'via Jason, M. Zurek' },
  { slot: '1.11', round: 1, name: 'Kenyon Sadiq',        position: 'TE', team: 'Dugan',    via: 'via Wayne' },
  { slot: '1.12', round: 1, name: 'Eli Stowers',         position: 'TE', team: 'Dugan',    via: 'via Bill' },
  // ── Round 2 ──
  { slot: '2.01', round: 2, name: 'Elijah Sarratt',      position: 'WR', team: 'Dugan' },
  { slot: '2.02', round: 2, name: 'Chris Bell',          position: 'WR', team: 'A. Zurek' },
  { slot: '2.03', round: 2, name: 'Denzel Boston',       position: 'WR', team: 'A. Zurek', via: 'via Cantone, Faybik' },
  { slot: '2.04', round: 2, name: 'Germie Bernard',      position: 'WR', team: 'Faybik',   via: 'via Ryan, A. Zurek' },
  { slot: '2.05', round: 2, name: 'Nick Singleton',      position: 'RB', team: 'Foley' },
  { slot: '2.06', round: 2, name: 'Ty Simpson',          position: 'QB', team: 'Cantone',  via: 'via Abad' },
  { slot: '2.07', round: 2, name: 'Ted Hurst',           position: 'WR', team: 'Faybik',   via: 'via Jared' },
  { slot: '2.08', round: 2, name: 'Carson Beck',         position: 'QB', team: 'Cantone',  via: 'via M.Zurek, Abad' },
  { slot: '2.09', round: 2, name: "De'Zhaun Stribling",  position: 'WR', team: 'Cantone',  via: 'via Faybik, Jason' },
  { slot: '2.10', round: 2, name: 'Mike Washington Jr.', position: 'RB', team: 'Faybik',   via: 'via Jason, Jared' },
  { slot: '2.11', round: 2, name: 'Emmit Johnson',       position: 'RB', team: 'Ryan',     via: 'via Wayne' },
  { slot: '2.12', round: 2, name: 'Kaytron Allen',       position: 'RB', team: 'Ryan',     via: 'via Bill' },
].map((r) => ({
  ...r,
  prices: r.round === 1 ? { ...R1 } : { ...R2 },
  originalPrice: r.round === 1 ? 2 : 1,
}))
