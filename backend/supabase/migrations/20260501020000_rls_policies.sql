-- RLS policies. Default-deny; explicit grants per table.
-- Model: every authenticated user is a league member. They read everything in the
-- league but only write rows they own (their team) — except commissioner / treasurer
-- / rules-committee, who get elevated grants for their domains.

-- Helper functions
create or replace function auth_user_id() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function is_commissioner() returns bool
language sql stable as $$
  select coalesce((select is_commissioner from app_users where id = auth.uid()), false)
$$;

create or replace function is_treasurer() returns bool
language sql stable as $$
  select coalesce((select is_treasurer from app_users where id = auth.uid()), false)
$$;

create or replace function is_rules_committee() returns bool
language sql stable as $$
  select coalesce((select is_rules_committee from app_users where id = auth.uid()), false)
$$;

create or replace function owns_team(p_team_id uuid) returns bool
language sql stable as $$
  select exists(select 1 from teams where id = p_team_id and owner_id = auth.uid())
$$;

-- ============================================================
-- Enable RLS
-- ============================================================
alter table app_users               enable row level security;
alter table seasons                 enable row level security;
alter table teams                   enable row level security;
alter table players                 enable row level security;
alter table contracts               enable row level security;
alter table rookie_picks            enable row level security;
alter table trades                  enable row level security;
alter table trade_assets            enable row level security;
alter table faab_balances           enable row level security;
alter table faab_bids               enable row level security;
alter table luxury_tax_events       enable row level security;
alter table weekly_matchups         enable row level security;
alter table weekly_high_points      enable row level security;
alter table low_points_parlay_weeks enable row level security;
alter table low_points_parlay_picks enable row level security;
alter table dues_payments           enable row level security;
alter table payouts                 enable row level security;
alter table belt_history            enable row level security;
alter table league_calendar         enable row level security;
alter table rule_proposals          enable row level security;
alter table rule_votes              enable row level security;
alter table reconciliation_log      enable row level security;
alter table sheet_lock              enable row level security;

-- ============================================================
-- app_users: read-all to league members; self-update only.
-- ============================================================
create policy app_users_read on app_users for select
  to authenticated using (true);
create policy app_users_self_update on app_users for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy app_users_commish_admin on app_users for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- seasons: read-all; commissioner-only writes.
-- ============================================================
create policy seasons_read on seasons for select
  to authenticated using (true);
create policy seasons_commish_write on seasons for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- teams: read-all; owner can update branding; commissioner full.
-- ============================================================
create policy teams_read on teams for select
  to authenticated using (true);
create policy teams_owner_branding on teams for update
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy teams_commish_write on teams for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- players: read-all; service role only writes (ESPN sync worker).
-- ============================================================
create policy players_read on players for select
  to authenticated using (true);

-- ============================================================
-- contracts: read-all; team owner can update IR / drop status; commissioner full.
-- Inserts go through stored procedures (no direct insert policy except for service role).
-- ============================================================
create policy contracts_read on contracts for select
  to authenticated using (true);
create policy contracts_owner_update on contracts for update
  to authenticated using (owns_team(team_id)) with check (owns_team(team_id));
create policy contracts_commish_write on contracts for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- rookie_picks: read-all; commissioner writes; trade-time updates via service role.
-- ============================================================
create policy rookie_picks_read on rookie_picks for select
  to authenticated using (true);
create policy rookie_picks_commish_write on rookie_picks for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- trades: read-all; either side can insert/update their own trade.
-- ============================================================
create policy trades_read on trades for select
  to authenticated using (true);
create policy trades_proposer_insert on trades for insert
  to authenticated with check (owns_team(proposed_by));
create policy trades_either_side_update on trades for update
  to authenticated using (owns_team(proposed_by) or owns_team(proposed_to))
  with check (owns_team(proposed_by) or owns_team(proposed_to));
create policy trades_commish_admin on trades for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- trade_assets: read-all; insert/update only via parent trade ownership.
-- ============================================================
create policy trade_assets_read on trade_assets for select
  to authenticated using (true);
create policy trade_assets_owner_write on trade_assets for all
  to authenticated using (
    exists(
      select 1 from trades t
      where t.id = trade_id
        and (owns_team(t.proposed_by) or owns_team(t.proposed_to))
    )
  ) with check (
    exists(
      select 1 from trades t
      where t.id = trade_id
        and (owns_team(t.proposed_by) or owns_team(t.proposed_to))
    )
  );

-- ============================================================
-- FAAB: read-all balances; bid is private until processed; only the owning team can
-- read their own pending bids.
-- ============================================================
create policy faab_balances_read on faab_balances for select
  to authenticated using (true);

create policy faab_bids_read_own_pending on faab_bids for select
  to authenticated using (
    owns_team(team_id) or result is not null or is_commissioner()
  );
create policy faab_bids_owner_insert on faab_bids for insert
  to authenticated with check (owns_team(team_id) and result is null);
create policy faab_bids_owner_withdraw on faab_bids for update
  to authenticated using (owns_team(team_id) and result is null)
  with check (owns_team(team_id) and result = 'withdrawn');

-- ============================================================
-- Luxury tax events: read-all; treasurer marks paid.
-- ============================================================
create policy luxury_tax_events_read on luxury_tax_events for select
  to authenticated using (true);
create policy luxury_tax_events_treasurer_pay on luxury_tax_events for update
  to authenticated using (is_treasurer()) with check (is_treasurer());
create policy luxury_tax_events_commish on luxury_tax_events for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- Weekly matchups + high points: read-all; ESPN sync worker writes via service role.
-- ============================================================
create policy weekly_matchups_read on weekly_matchups for select
  to authenticated using (true);
create policy weekly_high_points_read on weekly_high_points for select
  to authenticated using (true);
create policy weekly_high_points_treasurer_pay on weekly_high_points for update
  to authenticated using (is_treasurer()) with check (is_treasurer());

-- ============================================================
-- Low points parlay
-- ============================================================
create policy low_points_parlay_weeks_read on low_points_parlay_weeks for select
  to authenticated using (true);
create policy low_points_parlay_weeks_treasurer on low_points_parlay_weeks for all
  to authenticated using (is_treasurer()) with check (is_treasurer());

create policy low_points_parlay_picks_read on low_points_parlay_picks for select
  to authenticated using (true);
create policy low_points_parlay_picks_self on low_points_parlay_picks for all
  to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================
-- Dues + payouts: read-all; treasurer writes.
-- ============================================================
create policy dues_read on dues_payments for select
  to authenticated using (true);
create policy dues_treasurer_write on dues_payments for all
  to authenticated using (is_treasurer()) with check (is_treasurer());

create policy payouts_read on payouts for select
  to authenticated using (true);
create policy payouts_treasurer_write on payouts for all
  to authenticated using (is_treasurer()) with check (is_treasurer());

-- ============================================================
-- Belt history: read-all; commissioner + Jared (rule_committee proxy) write.
-- ============================================================
create policy belt_history_read on belt_history for select
  to authenticated using (true);
create policy belt_history_commish_write on belt_history for all
  to authenticated using (is_commissioner() or is_rules_committee())
  with check (is_commissioner() or is_rules_committee());

-- ============================================================
-- Calendar: read-all; commissioner writes.
-- ============================================================
create policy calendar_read on league_calendar for select
  to authenticated using (true);
create policy calendar_commish_write on league_calendar for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

-- ============================================================
-- Rule proposals + votes: read-all; submitter is the inserter; rules committee can update status.
-- ============================================================
create policy rule_proposals_read on rule_proposals for select
  to authenticated using (true);
create policy rule_proposals_self_insert on rule_proposals for insert
  to authenticated with check (submitter_id = auth.uid());
create policy rule_proposals_committee_update on rule_proposals for update
  to authenticated using (is_rules_committee() or is_commissioner())
  with check (is_rules_committee() or is_commissioner());

create policy rule_votes_read on rule_votes for select
  to authenticated using (true);
create policy rule_votes_self_write on rule_votes for all
  to authenticated using (voter_id = auth.uid()) with check (voter_id = auth.uid());

-- ============================================================
-- Reconciliation log + sheet lock: commissioner / treasurer / service-role only.
-- ============================================================
create policy reconciliation_log_admin_read on reconciliation_log for select
  to authenticated using (is_commissioner() or is_treasurer());
create policy reconciliation_log_admin_write on reconciliation_log for all
  to authenticated using (is_commissioner()) with check (is_commissioner());

create policy sheet_lock_admin on sheet_lock for all
  to authenticated using (is_commissioner()) with check (is_commissioner());
