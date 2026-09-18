// dashboardSections — WHAT the Dashboard is made of, and where each part
// sits by default.
//
// This list used to live inside DashboardView, next to the JSX, because
// every entry carried its own rendered node. The static half is here now so
// that Admin → Layout can list the sections — with real names — without
// importing the Dashboard, and so the order the league sees has one written
// source rather than being an artifact of where a block happened to be
// declared.
//
// DashboardView supplies the nodes by key; everything else about a section
// is declared here.
//
// ── The fields ───────────────────────────────────────────────
// `key`      matches the node key in DashboardView. Several keys are ALSO
//            Admin → Areas kill-switch keys (rules, parlay, ledger, history,
//            messages, odds, scoring, playoffs) — same namespace on purpose.
// `label`    what the commissioner sees in Admin → Layout.
// `rail`     the DEFAULT column: true = the desktop right-hand rail.
// `railSafe` whether the section CAN live in the rail at all. The rail is a
//            fixed 270px column (300px past 1250px), so it holds tiles and
//            short cards and nothing else. A section without this flag can't
//            be moved there — otherwise the first thing the layout editor
//            offers you is a way to break the page. New sections are not
//            rail-safe unless they say so, so the failure direction is
//            "stays in the main column", never "silently squashed".
// `phases`   the season phases this section belongs to; absent = all of
//            them. This is a SCHEDULE, not a layout choice, which is why it
//            lives here and not in the stored layout.
// `lead`     phases in which this section floats to the top regardless of
//            order — during the playoffs the bracket is the reason people
//            opened the app.
//
// Order here is the default order. `config/league.dashboardLayout` can
// reorder and re-column it; see services/dashboardLayout.js.

export const DASHBOARD_SECTIONS = [
  { key: 'closed',    label: 'Rosters-frozen notice',  glyph: '🔒', phases: ['dead'] },
  { key: 'live',      label: 'Live scoreboard',        glyph: '📡', phases: ['regular', 'playoffs'] },
  // HIDDEN, NOT REMOVED (Sep 10, 2026). The Power Rankings chart and the
  // In-Season Scoring block are off the Dashboard while the Taylor Made
  // rankings take that slot. `powerChart`, `scoringSection` and the
  // components behind them are all still there and still wired to their
  // Admin → Areas kill switches — putting either back is re-adding its one
  // line to this list:
  //   { key: 'power',   label: 'Power rankings chart', glyph: '📉' },
  //   { key: 'scoring', label: 'In-season scoring',    glyph: '📈', phases: ['regular', 'playoffs'] },
  { key: 'playoffs',  label: 'Playoff bracket',        glyph: '🏆', phases: ['regular', 'playoffs'], lead: ['playoffs'] },
  { key: 'calendar',  label: 'League calendar',        glyph: '🗓️' },
  { key: 'messages',  label: 'League messages',        glyph: '💬' },
  // The two long reads of the preseason, side by side at the top of the rail.
  { key: 'rankings',  label: 'Power Rankings',         glyph: '📊', rail: true, railSafe: true },
  { key: 'odds',      label: 'Championship odds',      glyph: '🎰', rail: true, railSafe: true, phases: ['preseason', 'regular'] },
  { key: 'rules',     label: 'Rules & reminders',      glyph: '📜', rail: true, railSafe: true },
  { key: 'offers',    label: 'Incoming trade offers',  glyph: '✉️' },
  { key: 'parlay',    label: 'Low Points Parlay',      glyph: '🎯', phases: ['regular'] },
  { key: 'team',      label: 'My Team card',           glyph: '🏈' },
  { key: 'history',   label: 'History & Trophy tiles', glyph: '📚', rail: true, railSafe: true },
  { key: 'match',     label: 'Trade match banner',     glyph: '⇄',  rail: true, railSafe: true },
  { key: 'teams',     label: 'All teams grid',         glyph: '👥' },
  { key: 'standings', label: 'Standings',              glyph: '📋' },
  { key: 'trades',    label: 'Recent trades',          glyph: '🤝' },
  { key: 'ledger',    label: 'Transaction log',        glyph: '🧾' },
]

export const SECTION_KEYS = DASHBOARD_SECTIONS.map((s) => s.key)

export const sectionByKey = Object.fromEntries(
  DASHBOARD_SECTIONS.map((s) => [s.key, s]),
)
