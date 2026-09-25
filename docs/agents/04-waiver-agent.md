# Agent 4: Waiver Targets (Jared's Team Only)

**Todoist:** `[4/6] Waiver target agent` · p3
**Runs:** an IFFL Analytics Engine module (Python, Rudy / ACC job)
**Visible to:** Jared only, on Telegram. **Never** in `iffl-auth`.

## Goal

The agent ranks free agents by how much they'd help **Jared's** roster, and pairs each add with a drop.

## Scope line

- It **reads** the league-wide free-agent pool. It has to, since that's what the waiver wire is.
- It **analyzes and recommends** for Jared's team (ESPN id 10) only. It gives no advice or opinions on any other roster.
- It's recommend-only. It never submits claims in ESPN.

## Relationship to existing work

- It **absorbs** the specced daily 9:00 AM CT best-FA summary (ESPN public API → IFFL Bots Telegram topic). One agent, not two.
- It shares a data layer with #5 (roster, projections, injuries).

## Build steps

### 1. Data layer (shared with #5)
- `iffl_engine/data/espn.py`: `free_agents(season)` (`?view=kona_player_info` with a free-agent filter) and `roster(team_id=10)` (`?view=mRoster`).
- Cache to DuckDB on Rudy.
- Projections: FantasyPros ROS + weekly (**blocked on the ~$30–50/mo API decision**; fall back to ESPN projections).
- **Done when:** both calls return typed rows for 2026 wk 3.

### 2. Need model
- A hole score per slot: superflex QB depth, next 4 weeks of byes, injured or out starters.
- `value = (proj − replacement_starter_proj) × need_weight`.
- Todoist Fantasy tags: `watch` gives a +boost; `fade` means **never recommend** (Garrett Wilson, Harvey).
- **Done when:** the unit tests show a fade player never surfaces and a bye hole lifts that position.

### 3. Drop pairing
- Suggest a drop from the bench: lowest ROS value, **never** a keeper candidate (price and keeper flags from the 2025 Keeper Master).
- FAAB bid range, only if the IFFL uses FAAB (confirm the rules).
- **Done when:** every add has a drop that makes the roster legal.

### 4. Delivery
- **Daily 9:00 CT:** top 5 changes since yesterday (short).
- **Tuesday, before the waiver run:** the full memo with the top 10, the drop for each and the reason.
- ACC job on Rudy, Telegram delivery, health line in the ACC dashboard.
- **Done when:** two consecutive days deliver without a manual kick.

## Open decisions
- [ ] Projections API budget (unblocks step 1 quality).
- [ ] Does the IFFL use FAAB or a rolling priority?
- [ ] Waiver run day and time (for the Tuesday memo timing).
