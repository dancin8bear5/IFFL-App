// 2026 Rookie Draft results — Keeper Master List p5 (draft held Jul 16, 2026).
// Round 1 = $2 salary, Round 2 = $1; escalation follows the standard
// +($5 × years kept) curve, so R1 runs $2 → $7 → $17 and R2 $1 → $6 → $16.
// NFL teams + name spellings verified against 2026 NFL draft coverage
// (nfl.com, team sites, ESPN — Aug 2026). Three sheet spellings corrected:
// Carnell Tate (was Caernell), KC Concepcion (was Conception),
// Emmett Johnson (was Emmit).

const R1 = { 2026: 2, 2027: 7, 2028: 17 }
const R2 = { 2026: 1, 2027: 6, 2028: 16 }

export const rookieClass2026 = [
  // ── Round 1 ──
  { slot: '1.01', round: 1, name: 'Jeremiyah Love',      position: 'RB', nflTeam: 'Arizona Cardinals',    team: 'Dugan' },
  { slot: '1.02', round: 1, name: 'Fernando Mendoza',    position: 'QB', nflTeam: 'Las Vegas Raiders',    team: 'Jared',    via: 'via A. Zurek, Faybik' },
  { slot: '1.03', round: 1, name: 'Jadarian Price',      position: 'RB', nflTeam: 'Seattle Seahawks',     team: 'Cantone' },
  { slot: '1.04', round: 1, name: 'Carnell Tate',        position: 'WR', nflTeam: 'Tennessee Titans',     team: 'Bill',     via: 'via Ryan' },
  { slot: '1.05', round: 1, name: 'Jordyn Tyson',        position: 'WR', nflTeam: 'New Orleans Saints',   team: 'Foley' },
  { slot: '1.06', round: 1, name: 'Makai Lemon',         position: 'WR', nflTeam: 'Philadelphia Eagles',  team: 'Foley',    via: 'via Abad' },
  { slot: '1.07', round: 1, name: 'KC Concepcion',       position: 'WR', nflTeam: 'Cleveland Browns',     team: 'Jared' },
  { slot: '1.08', round: 1, name: 'Omar Cooper Jr.',     position: 'WR', nflTeam: 'New York Jets',        team: 'Cantone',  via: 'via M.Zurek, Abad' },
  { slot: '1.09', round: 1, name: 'Jonah Coleman',       position: 'RB', nflTeam: 'Denver Broncos',       team: 'A. Zurek', via: 'via Faybik' },
  { slot: '1.10', round: 1, name: 'Antonio Williams',    position: 'WR', nflTeam: 'Washington Commanders', team: 'A. Zurek', via: 'via Jason, M. Zurek' },
  { slot: '1.11', round: 1, name: 'Kenyon Sadiq',        position: 'TE', nflTeam: 'New York Jets',        team: 'Dugan',    via: 'via Wayne' },
  { slot: '1.12', round: 1, name: 'Eli Stowers',         position: 'TE', nflTeam: 'Philadelphia Eagles',  team: 'Dugan',    via: 'via Bill' },
  // ── Round 2 ──
  { slot: '2.01', round: 2, name: 'Elijah Sarratt',      position: 'WR', nflTeam: 'Baltimore Ravens',     team: 'Dugan' },
  { slot: '2.02', round: 2, name: 'Chris Bell',          position: 'WR', nflTeam: 'Miami Dolphins',       team: 'A. Zurek' },
  { slot: '2.03', round: 2, name: 'Denzel Boston',       position: 'WR', nflTeam: 'Cleveland Browns',     team: 'A. Zurek', via: 'via Cantone, Faybik' },
  { slot: '2.04', round: 2, name: 'Germie Bernard',      position: 'WR', nflTeam: 'Pittsburgh Steelers',  team: 'Faybik',   via: 'via Ryan, A. Zurek' },
  { slot: '2.05', round: 2, name: 'Nick Singleton',      position: 'RB', nflTeam: 'Tennessee Titans',     team: 'Foley' },
  { slot: '2.06', round: 2, name: 'Ty Simpson',          position: 'QB', nflTeam: 'Los Angeles Rams',     team: 'Cantone',  via: 'via Abad' },
  { slot: '2.07', round: 2, name: 'Ted Hurst',           position: 'WR', nflTeam: 'Tampa Bay Buccaneers', team: 'Faybik',   via: 'via Jared' },
  { slot: '2.08', round: 2, name: 'Carson Beck',         position: 'QB', nflTeam: 'Arizona Cardinals',    team: 'Cantone',  via: 'via M.Zurek, Abad' },
  { slot: '2.09', round: 2, name: "De'Zhaun Stribling",  position: 'WR', nflTeam: 'San Francisco 49ers',  team: 'Cantone',  via: 'via Faybik, Jason' },
  { slot: '2.10', round: 2, name: 'Mike Washington Jr.', position: 'RB', nflTeam: 'Las Vegas Raiders',    team: 'Faybik',   via: 'via Jason, Jared' },
  { slot: '2.11', round: 2, name: 'Emmett Johnson',      position: 'RB', nflTeam: 'Kansas City Chiefs',   team: 'Ryan',     via: 'via Wayne' },
  { slot: '2.12', round: 2, name: 'Kaytron Allen',       position: 'RB', nflTeam: 'Washington Commanders', team: 'Ryan',    via: 'via Bill' },
].map((r) => ({
  ...r,
  prices: r.round === 1 ? { ...R1 } : { ...R2 },
  originalPrice: r.round === 1 ? 2 : 1,
}))
