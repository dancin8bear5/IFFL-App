# Agent 5: Start/Sit (Jared's Team Only)

**Todoist:** `[5/6] Start/sit agent` · p3
**Runs:** the IFFL Analytics Engine lineup module (Python, Rudy / ACC job)
**Visible to:** Jared only, on Telegram. **Never** in `iffl-auth`.
**Depends on:** #4 step 1 (the shared data layer).

## Goal

Each week the agent recommends Jared's best legal superflex lineup, with a one-line reason per call.

## Scope line

- It reads Jared's roster (team id 10) plus the opponent's projected total, which it needs for win probability. It reads nothing else from other teams.
- It's recommend-only. It never sets the lineup in ESPN.

## Build steps

### 1. Inputs
- Roster + slot rules (superflex: QB/RB/WR/TE eligibility for the OP slot), from the #4 data layer.
- Weekly projections (FantasyPros or the ESPN fallback), injury status, inactives (Sunday 90 minutes before kickoff).
- Vegas implied team totals (Odds API, same budget decision as #4).
- **Done when:** one call builds the week's input frame.

### 2. Optimizer
- Most-restrictive-slot-first fill. That's already proven optimal against brute force on 300 random rosters in the repo, so **port it with its test**.
- Mode switch by win probability: if Jared is a favorite, maximize the floor; if an underdog, maximize the ceiling.
- **Done when:** the ported test passes and the mode flips on a synthetic underdog week.

### 3. Explanations
- One line per start or sit: `Start Egbuka over X: +3.1 proj, CHI bottom-5 vs WR`.
- Flag coin-flips (< 1 point gap) as ⚖️ so Jared makes those calls himself.
- **Done when:** every flex decision carries a reason.

### 4. Schedule + delivery
- **Thu 17:00 CT:** a TNF-only check (any TNF player to start or sit).
- **Sun 10:00 CT:** the final lineup, after inactives.
- **Sun 11:45 CT:** re-run and send only if a starter went inactive (a ⚠️ alert).
- Telegram (IFFL Bots, private topic).
- **Done when:** a full week of alerts arrives on time.

## Open decisions
- [ ] Same projection source as #4 (confirm the budget).
- [ ] Floor/ceiling threshold: 55/45 win probability, or something else?
- [ ] Include a DST/K streaming suggestion (overlaps with #4)?
