You are working on "The Belt", the web app for IFFL — a dynasty keeper fantasy football league of 12 friends that has run since 2008. The commissioner, Jared, is not a developer by trade. Members open the app mostly on their phones.

The repo you are in is a fresh checkout of `main`. Read `CLAUDE.md` first: it is long, and it records why things are the way they are — including features that were deliberately removed or hidden. Do not propose bringing back something `CLAUDE.md` says was removed on purpose.

The app is Vite + React in `web/src`. Its style is declaration-driven: a new thing is usually one object in a registry (`services/dashboardSections.js`, `services/historyCategories.js`) plus a pure, unit-tested function in `web/src/services/`, rather than a new screen. It has no web fonts, no charting library and no drag-and-drop, and adding a dependency is off the table. Dark theme only; design tokens are in `web/src/styles/theme.css`.

Everything about the league that a browser may show is already in the repo as bundled data (`web/src/data/`) or fetched from Firestore through `web/src/services/firestoreService.js`. The full ESPN history (2008 onward) is in `data/iffl_fantasy_history_2008-2025.csv`.
