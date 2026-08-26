-- Make rookie_picks unique constraint non-deferrable so ON CONFLICT can use it.
-- The deferrable clause was speculative future-proofing for in-draft swap UX
-- and isn't needed; we can swap picks via a transaction without it.

alter table rookie_picks
  drop constraint if exists rookie_picks_pick_year_round_slot_key;

alter table rookie_picks
  add constraint rookie_picks_pick_year_round_slot_key
    unique (pick_year, round, slot);
