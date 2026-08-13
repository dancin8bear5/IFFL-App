// staticData — port of the static config in Models/DataModels.swift and
// the milestone dates in Views/DashboardView.swift.

// fantasyTeams: name, display color, beltWins (championships, ESPN history 2009–2025)
export const fantasyTeams = [
  { name: 'A. Zurek', color: '#DC2626', beltWins: 0 },
  { name: 'Abad',     color: '#2563EB', beltWins: 1 }, // 2023
  { name: 'Bill',     color: '#16A34A', beltWins: 2 }, // 2024, 2025
  { name: 'Cantone',  color: '#7C3AED', beltWins: 1 }, // 2021
  { name: 'Dugan',    color: '#EA580C', beltWins: 0 },
  { name: 'Faybik',   color: '#CA8A04', beltWins: 1 }, // 2017
  { name: 'Foley',    color: '#BE185D', beltWins: 0 },
  { name: 'Jared',    color: '#0891B2', beltWins: 3 }, // 2018, 2019, 2020
  { name: 'Jason',    color: '#4338CA', beltWins: 0 },
  { name: 'M. Zurek', color: '#0D9488', beltWins: 1 }, // 2016
  { name: 'Ryan',     color: '#14B8A6', beltWins: 2 }, // 2012, 2014
  { name: 'Wayne',    color: '#92400E', beltWins: 1 }, // 2022
]

export const teamByName = Object.fromEntries(fantasyTeams.map((t) => [t.name, t]))

// League calendar — update dates each season (mirrors BeltMilestone.all)
export const milestones = [
  { name: 'Rookie Draft',       icon: '🎓', color: '#A855F7', date: new Date(2026, 5, 21) },
  { name: 'Keeper Declaration', icon: '🕐', color: '#06B6D4', date: new Date(2026, 6, 15) },
  { name: 'Auction Draft',      icon: '💰', color: '#F4A261', date: new Date(2026, 7, 22) },
  { name: 'NFL Kickoff',        icon: '🏈', color: '#22C55E', date: new Date(2026, 8, 10) },
  { name: 'Trade Deadline',     icon: '⇄',  color: '#F97316', date: new Date(2026, 10, 4) },
  { name: 'Playoffs',           icon: '🏆', color: '#E63946', date: new Date(2026, 11, 10) },
]

// Settings — logo presets (emoji stand-ins for the SF Symbol set on iOS)
export const logoPresets = ['🔥', '⚡', '⭐', '👑', '🛡️', '🏈', '🏆', '🌪️', '🍀', '💥', '⬡', '💎']
