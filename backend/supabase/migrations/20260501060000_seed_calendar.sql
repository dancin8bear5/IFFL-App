-- Seed the league_calendar table with the canonical 2026 milestones.
-- Dates are derived from the rules document (Section II / 2026 League Calendar
-- tab in the Sheet). All times are 17:00 America/Chicago (5pm) by default —
-- override per-milestone where the rules specify.

-- Idempotent insert by (season, milestone)
create unique index if not exists league_calendar_season_milestone_idx
  on league_calendar (season, milestone);

insert into league_calendar(season, milestone, due_at, description) values
  (2026, 'Trade Window Opens',          '2026-02-10 17:00:00-06', 'Trade window opens for the 2026 season.'),
  (2026, 'Send Auction Values Sheet',    '2026-02-10 17:00:00-06', 'Auction value spreadsheet distributed to owners.'),
  (2026, 'Rookie Draft Pick Lottery',    '2026-02-11 20:00:00-06', 'Lottery determines picks 1-4 for the rookie draft.'),
  (2026, 'NFL Draft',                    '2026-04-23 19:00:00-05', 'NFL Draft begins; rookie evaluation period opens.'),
  (2026, 'New Rule Submission Deadline', '2026-05-09 23:59:00-05', 'Last day to submit rule proposals via Google form.'),
  (2026, 'New Rule Communication',       '2026-05-30 17:00:00-05', 'Commissioner communicates proposed rules to league.'),
  (2026, 'New Rule Voting',              '2026-06-13 23:59:00-05', 'Final day of rule voting.'),
  (2026, 'Rookie Draft',                 '2026-07-21 20:00:00-05', '2-round rookie draft.'),
  (2026, 'Select Keepers',               '2026-08-22 14:00:00-05', 'Keeper selection deadline (2-4 days before auction).'),
  (2026, 'League Dues Paid',             '2026-08-26 17:00:00-05', 'All league dues must be paid before draft.'),
  (2026, 'IFFL Auction Draft',           '2026-08-27 20:00:00-05', '2026 live auction draft on ESPN.'),
  (2026, 'NFL Season Start',             '2026-09-10 19:00:00-05', 'NFL kickoff — Week 1 begins.'),
  (2026, 'Trade Deadline',               '2026-11-19 14:00:00-06', 'Trade deadline — 2pm CST.'),
  (2026, 'Rosters Frozen',               '2027-01-04 23:59:00-06', 'End of NFL Week 18 / regular season; rosters lock.'),
  (2026, 'Start of Off-Season',          '2026-02-09 17:00:00-06', 'Day after Super Bowl. Off-season activities begin.')
on conflict (season, milestone) do update
  set due_at = excluded.due_at,
      description = excluded.description;
