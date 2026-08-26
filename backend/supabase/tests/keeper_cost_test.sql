-- pgTAP tests for keeper_cost ladder.
-- Run with:  supabase test db
-- (or psql -f keeper_cost_test.sql against a DB with pgTAP installed)

begin;

create extension if not exists pgtap;

select plan(13);

-- Sanity: original cost preserved when kept = 0
select is(keeper_cost(10::numeric, 0), 10::numeric, '$10 original, 0 keeps -> $10');
select is(keeper_cost(50::numeric, 0), 50::numeric, '$50 original, 0 keeps -> $50');

-- Step ladder: $10 original through 5 keeps -> 15, 25, 40, 60, 85
select is(keeper_cost(10::numeric, 1), 15::numeric, '$10 original, 1 keep  -> $15 (+5)');
select is(keeper_cost(10::numeric, 2), 25::numeric, '$10 original, 2 keeps -> $25 (+10)');
select is(keeper_cost(10::numeric, 3), 40::numeric, '$10 original, 3 keeps -> $40 (+15)');
select is(keeper_cost(10::numeric, 4), 60::numeric, '$10 original, 4 keeps -> $60 (+20)');
select is(keeper_cost(10::numeric, 5), 85::numeric, '$10 original, 5 keeps -> $85 (+25)');

-- $1 baseline (rookie-round 2 / waiver-cleared) ladder: 6, 16, 31, 51, 76
select is(keeper_cost(1::numeric, 1), 6::numeric, '$1 original, 1 keep -> $6');
select is(keeper_cost(1::numeric, 5), 76::numeric, '$1 original, 5 keeps -> $76');

-- $2 baseline (rookie-round 1 / waiver baseline) ladder: 7
select is(keeper_cost(2::numeric, 1), 7::numeric, '$2 original, 1 keep -> $7');

-- Sheet-validated value: A. Zurek's Stefon Diggs ($10 original, 2024 -> 2026 = 2 keeps -> $25)
select is(keeper_cost(10::numeric, 2), 25::numeric,
  'Sheet match: Diggs $10 original + 2 keeps = $25');

-- Boundary: kept exceeds max
select throws_ok(
  $$ select keeper_cost(10::numeric, 6) $$,
  'years_kept must be <= 5, got 6'
);

-- Boundary: negative kept
select throws_ok(
  $$ select keeper_cost(10::numeric, -1) $$,
  'years_kept must be >= 0, got -1'
);

select * from finish();
rollback;
