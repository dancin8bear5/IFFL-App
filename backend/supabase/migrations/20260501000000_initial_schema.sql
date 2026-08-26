-- IFFL App initial schema
-- Postgres 15+, Supabase. RLS policies live in the next migration.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================

create type acquisition_source as enum (
  'auction', 'rookie_draft', 'faab', 'trade', 'keeper', 'free_agent', 'draft_pick'
);

create type trade_status as enum (
  'proposed', 'accepted', 'rejected', 'cancelled', 'expired',
  'luxtax_pending', 'voided'
);

create type trade_asset_type as enum ('contract', 'rookie_pick', 'faab_dollars');

create type trade_source_channel as enum ('espn_email', 'ios_app');

create type faab_bid_result as enum ('won', 'lost', 'tied_lost', 'withdrawn');

create type matchup_result as enum ('W', 'L', 'T');

create type parlay_status as enum ('pending', 'placed', 'won', 'lost', 'cashed_out');

create type rule_category as enum ('starters', 'scoring', 'money', 'operations');

create type rule_proposal_status as enum (
  'submitted', 'rejected_by_committee', 'open', 'passed_round1', 'passed', 'rejected'
);

create type payment_method as enum ('venmo', 'paypal', 'zelle', 'other');

create type payout_type as enum (
  'reg_1st', 'reg_2nd', 'weekly_high', 'playoff_1st', 'playoff_2nd', 'playoff_3rd',
  'low_parlay', 'luxtax_distribution'
);

-- ============================================================
-- Identity
-- ============================================================

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  master_name text not null unique,            -- "A. Zurek", "J. Taylor", etc — matches Sheet
  full_name text not null,
  email text not null unique,
  phone text,
  groupme_handle text,
  is_commissioner bool not null default false,
  is_treasurer bool not null default false,
  is_rules_committee bool not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Seasons + Teams
-- ============================================================

create table seasons (
  year int primary key,
  config jsonb not null default jsonb_build_object(
    'auction_budget', 200,
    'faab_budget', 150,
    'lux_tax_cap', 300,
    'lux_tax_penalty', 275,
    'lux_tax_per_team', 25,
    'dues', 250,
    'keeper_steps', jsonb_build_array(5, 10, 15, 20, 25),
    'roster_size', 21,
    'starters', jsonb_build_object('QB',1,'RB',2,'WR',2,'TE',1,'FLEX',1,'OP',1,'DST',1),
    'ir_slots', 2,
    'reg_season_weeks', 14,
    'playoff_weeks', jsonb_build_array(15,16,17),
    'playoff_teams', 8,
    'playoff_seed_bonus_per_win', 5
  ),
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users(id) on delete restrict,
  season int not null references seasons(year) on delete restrict,
  espn_team_name text not null,
  team_avatar_url text,                        -- Supabase Storage URL
  monogram_color text,                         -- hex, derived from avatar
  unique (owner_id, season)
);
create index teams_season_idx on teams(season);

-- ============================================================
-- Players (NFL catalog)
-- ============================================================

create table players (
  id uuid primary key default gen_random_uuid(),
  espn_id text unique,
  full_name text not null,
  position text not null check (position in ('QB','RB','WR','TE','K','D/ST','OP')),
  nfl_team text,
  created_at timestamptz not null default now()
);
create unique index players_canon_idx on players (lower(full_name), position);
create index players_espn_idx on players(espn_id) where espn_id is not null;

-- ============================================================
-- Contracts (the heart of keeper management)
-- ============================================================

create table contracts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  season int not null references seasons(year),
  source acquisition_source not null,
  original_cost numeric(10,2) not null check (original_cost >= 0),
  acquired_in_season int not null,
  years_kept int not null default 0 check (years_kept >= 0 and years_kept <= 5),
  current_keeper_cost numeric(10,2) not null,  -- materialized via trigger
  rookie_round int,                            -- if source = rookie_draft
  rookie_year int,
  is_on_ir bool not null default false,
  is_dropped bool not null default false,
  dropped_at timestamptz,
  faab_clears_after_drop int not null default 0,
  trade_history_text text,                     -- free-text from sheet, e.g. "via Bill"
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one active contract per (team, player, season)
create unique index contracts_active_idx
  on contracts(team_id, player_id, season) where is_dropped = false;
create index contracts_team_season_idx on contracts(team_id, season);
create index contracts_player_idx on contracts(player_id);

-- ============================================================
-- Rookie picks (first-class so they can be traded)
-- ============================================================

create table rookie_picks (
  id uuid primary key default gen_random_uuid(),
  pick_year int not null,                      -- 2026, 2027, ...
  round int not null check (round in (1, 2)),  -- IFFL has 2 rounds
  slot int,                                    -- 1..12 set after lottery; null until then
  owner_team_id uuid references teams(id) on delete restrict,
  used_for_player_id uuid references players(id),  -- set after rookie draft
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pick_year, round, slot) deferrable initially deferred
);
create index rookie_picks_owner_idx on rookie_picks(owner_team_id);
create index rookie_picks_year_round_idx on rookie_picks(pick_year, round);

-- ============================================================
-- Trades
-- ============================================================

create table trades (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid not null references teams(id),
  proposed_to uuid not null references teams(id),
  status trade_status not null default 'proposed',
  source_channel trade_source_channel not null default 'ios_app',
  espn_email_subject text,                     -- when source_channel = 'espn_email'
  espn_email_body text,
  espn_email_received_at timestamptz,
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  luxtax_owed_by_team_id uuid references teams(id),
  luxtax_payment_due_at timestamptz,
  luxtax_paid_at timestamptz,
  notes text,
  check (proposed_by <> proposed_to)
);
create index trades_status_idx on trades(status);
create index trades_proposer_idx on trades(proposed_by);
create index trades_proposee_idx on trades(proposed_to);

create table trade_assets (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trades(id) on delete cascade,
  giving_team_id uuid not null references teams(id),
  asset_type trade_asset_type not null,
  contract_id uuid references contracts(id),
  rookie_pick_id uuid references rookie_picks(id),
  faab_amount numeric(10,2),
  check (
    (asset_type = 'contract' and contract_id is not null and rookie_pick_id is null and faab_amount is null) or
    (asset_type = 'rookie_pick' and rookie_pick_id is not null and contract_id is null and faab_amount is null) or
    (asset_type = 'faab_dollars' and faab_amount is not null and contract_id is null and rookie_pick_id is null)
  )
);
create index trade_assets_trade_idx on trade_assets(trade_id);

-- ============================================================
-- FAAB
-- ============================================================

create table faab_balances (
  team_id uuid not null references teams(id) on delete cascade,
  season int not null references seasons(year),
  balance numeric(10,2) not null default 150.00 check (balance >= 0),
  primary key (team_id, season)
);

create table faab_bids (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  player_id uuid not null references players(id),
  season int not null references seasons(year),
  amount numeric(10,2) not null check (amount >= 0),
  conditional_drop_contract_id uuid references contracts(id),
  submitted_at timestamptz not null default now(),
  process_at timestamptz not null,             -- next 11am America/Chicago
  result faab_bid_result,
  result_processed_at timestamptz
);
create index faab_bids_processing_idx on faab_bids(process_at) where result is null;
create index faab_bids_team_season_idx on faab_bids(team_id, season);

-- ============================================================
-- Luxury Tax events
-- ============================================================

create table luxury_tax_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  season int not null references seasons(year),
  triggered_by_trade_id uuid references trades(id),
  total_penalty numeric(10,2) not null default 275.00,
  per_other_team numeric(10,2) not null default 25.00,
  due_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index luxury_tax_events_team_idx on luxury_tax_events(team_id, season);
create index luxury_tax_events_unpaid_idx on luxury_tax_events(due_at) where paid_at is null;

-- ============================================================
-- Weekly results
-- ============================================================

create table weekly_matchups (
  season int not null references seasons(year),
  week int not null check (week between 1 and 17),
  team_id uuid not null references teams(id),
  opponent_team_id uuid references teams(id),
  team_points numeric(10,2),
  bench_points numeric(10,2),
  result matchup_result,
  is_playoff bool not null default false,
  seed_bonus numeric(10,2) not null default 0,
  primary key (season, week, team_id)
);
create index weekly_matchups_season_week_idx on weekly_matchups(season, week);

create table weekly_high_points (
  season int not null references seasons(year),
  week int not null check (week between 1 and 14),
  owner_id uuid not null references app_users(id),
  amount numeric(10,2) not null default 50.00,
  paid_at timestamptz,
  primary key (season, week)
);

-- ============================================================
-- Low Points Parlay
-- ============================================================

create table low_points_parlay_weeks (
  season int not null references seasons(year),
  week int not null check (week between 1 and 14),
  low_team_id uuid references teams(id),
  contribution numeric(10,2) not null default 10.00,
  sportsbook text,
  bet_proof_url text,
  status parlay_status not null default 'pending',
  payout numeric(10,2),
  created_at timestamptz not null default now(),
  primary key (season, week)
);

create table low_points_parlay_picks (
  season int not null,
  week int not null,
  owner_id uuid not null references app_users(id),
  player_id uuid not null references players(id),
  hit bool,
  primary key (season, week, owner_id),
  foreign key (season, week) references low_points_parlay_weeks(season, week)
);

-- ============================================================
-- Dues + payouts
-- ============================================================

create table dues_payments (
  owner_id uuid not null references app_users(id),
  season int not null references seasons(year),
  amount numeric(10,2) not null default 250.00,
  method payment_method,
  paid_at timestamptz,
  notes text,
  primary key (owner_id, season)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_users(id),
  season int not null references seasons(year),
  type payout_type not null,
  amount numeric(10,2) not null,
  paid_at timestamptz,
  notes text
);
create index payouts_owner_season_idx on payouts(owner_id, season);

-- ============================================================
-- Belt history
-- ============================================================

create table belt_history (
  season int primary key references seasons(year),
  champion_owner_id uuid not null references app_users(id),
  plate_purchased bool not null default false,
  plate_purchased_at timestamptz,
  shipped_to_next_holder bool not null default false,
  shipped_at timestamptz,
  notes text
);

-- ============================================================
-- Calendar
-- ============================================================

create table league_calendar (
  id uuid primary key default gen_random_uuid(),
  season int not null references seasons(year),
  milestone text not null,
  due_at timestamptz not null,
  description text,
  created_at timestamptz not null default now()
);
create index league_calendar_due_idx on league_calendar(due_at);

-- ============================================================
-- Rule proposals + voting (Section VI)
-- ============================================================

create table rule_proposals (
  id uuid primary key default gen_random_uuid(),
  season int not null references seasons(year),
  category rule_category not null,
  title text not null,
  body text not null,
  submitter_id uuid not null references app_users(id),
  status rule_proposal_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz
);
create index rule_proposals_season_status_idx on rule_proposals(season, status);

create table rule_votes (
  proposal_id uuid not null references rule_proposals(id) on delete cascade,
  voter_id uuid not null references app_users(id),
  vote bool not null,
  voted_at timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

-- ============================================================
-- Reconciliation log (parallel-run window)
-- ============================================================

create table reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  tab_name text not null,
  diff_count int not null default 0,
  diff_payload jsonb,                          -- structured rows that differ
  resolved_at timestamptz,
  resolution text                              -- 'sheet_to_db' | 'db_to_sheet' | 'no_action'
);
create index reconciliation_log_unresolved_idx on reconciliation_log(run_at desc) where resolved_at is null;

-- ============================================================
-- Sheet write coordination (advisory locks shared with Apps Script)
-- ============================================================

create table sheet_lock (
  tab_name text primary key,
  locked_by text not null,                     -- 'apps_script' | 'iffl_python_service' | 'sheet_mirror'
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ============================================================
-- Updated-at triggers
-- ============================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_updated_at before update on app_users
  for each row execute function set_updated_at();

create trigger contracts_updated_at before update on contracts
  for each row execute function set_updated_at();
