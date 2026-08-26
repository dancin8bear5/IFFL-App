-- Keeper cost ladder + triggers + team salary view.
-- Per IFFL rules Section II:
--   Cost: 1st year kept: original + $5
--   Cost: 2nd year kept: previous + $10  (original + $15)
--   Cost: 3rd year kept: previous + $15  (original + $30)
--   Cost: 4th year kept: previous + $20  (original + $50)
--   Cost: 5th year kept: previous + $25  (original + $75)
-- Validated against sheet sample: $10 original + 2 keeps = $25.

-- ============================================================
-- keeper_cost(original, years_kept) -> cost
-- ============================================================

create or replace function keeper_cost(original numeric, years_kept int)
returns numeric
language plpgsql
immutable
as $$
declare
  cumulative_step numeric := 0;
  i int;
  steps int[] := array[5, 10, 15, 20, 25];
begin
  if years_kept is null or years_kept < 0 then
    raise exception 'years_kept must be >= 0, got %', years_kept;
  end if;
  if years_kept > 5 then
    raise exception 'years_kept must be <= 5, got %', years_kept;
  end if;
  if original is null or original < 0 then
    raise exception 'original cost must be >= 0, got %', original;
  end if;

  for i in 1..years_kept loop
    cumulative_step := cumulative_step + steps[i];
  end loop;

  return original + cumulative_step;
end;
$$;

comment on function keeper_cost(numeric, int) is
  'IFFL keeper cost ladder. years_kept=0 returns original; +5/+10/+15/+20/+25 cumulative.';

-- ============================================================
-- Trigger to materialize current_keeper_cost on contracts
-- ============================================================

create or replace function contracts_set_keeper_cost()
returns trigger
language plpgsql
as $$
begin
  new.current_keeper_cost := keeper_cost(new.original_cost, new.years_kept);
  return new;
end;
$$;

create trigger contracts_keeper_cost_biu
  before insert or update of original_cost, years_kept on contracts
  for each row execute function contracts_set_keeper_cost();

-- ============================================================
-- Waiver-wire reset: when claiming a dropped player whose contract
-- has cleared >= 2 FAAB rounds, reset to $2 baseline keeper.
-- (Helper used by faab-process Edge Function.)
-- ============================================================

create or replace function reset_contract_to_waiver_baseline(p_contract_id uuid, p_new_team_id uuid)
returns void
language plpgsql
as $$
begin
  update contracts
  set
    team_id = p_new_team_id,
    source = 'faab',
    original_cost = 2.00,
    years_kept = 0,
    is_dropped = false,
    dropped_at = null,
    faab_clears_after_drop = 0
  where id = p_contract_id;
end;
$$;

-- ============================================================
-- View: team_salary_summary
-- Sums non-waiver contracts toward the $300 luxury tax cap.
-- "Waiver Wire" players (source='faab' with original_cost=$2 and 0 years kept,
-- created from a waiver pickup) do NOT count toward the cap per the rules.
-- ============================================================

create or replace view team_salary_summary as
select
  t.id as team_id,
  t.season,
  t.owner_id,
  coalesce(sum(c.current_keeper_cost) filter (
    where c.is_dropped = false
      and not (c.source = 'faab' and c.original_cost = 2.00 and c.years_kept = 0)
  ), 0) as cap_salary,
  coalesce(sum(c.current_keeper_cost) filter (where c.is_dropped = false), 0) as total_salary,
  count(*) filter (where c.is_dropped = false) as roster_count
from teams t
left join contracts c on c.team_id = t.id and c.season = t.season
group by t.id, t.season, t.owner_id;

comment on view team_salary_summary is
  'Per-team cap usage. cap_salary excludes "Waiver Wire" players (those created via FAAB at $2 baseline).';
