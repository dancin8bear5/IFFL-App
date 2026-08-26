-- Update owner emails to the real values from the rules doc + add a trigger
-- that auto-links new auth.users rows to their corresponding app_users row by
-- matching on email. The previous seed used synthetic @iffl.local addresses.
--
-- Two-part operation:
--   1. UPSERT real emails into app_users (idempotent on master_name)
--   2. Add an after-insert trigger on auth.users that links by email
--   3. Backfill: link any existing auth.users to their matching app_users row

-- Real owner emails (from the 2025 IFFL Rules doc)
update app_users set email = 'corey.abad@gmail.com'      where master_name = 'Abad';
update app_users set email = 'azurek66@gmail.com'        where master_name = 'A. Zurek';
update app_users set email = 'hoganbill6@gmail.com'      where master_name = 'Bill';
update app_users set email = 'jcanto01@gmail.com'        where master_name = 'Cantone';
update app_users set email = 'mikeduga@gmail.com'        where master_name = 'Dugan';
update app_users set email = 'mfaybik@gmail.com'         where master_name = 'Faybik';
update app_users set email = 'bjfoley1313@gmail.com'     where master_name = 'Foley';
update app_users set email = 'jaredrogtaylor@gmail.com'  where master_name = 'Jared';
update app_users set email = 'littlewyvern@gmail.com'    where master_name = 'Jason';
update app_users set email = 'zurezo@gmail.com'          where master_name = 'M. Zurek';
update app_users set email = 'ryan.schwerman@gmail.com'  where master_name = 'Ryan';
update app_users set email = 'wayne.vonderheide@gmail.com' where master_name = 'Wayne';

-- Trigger that links new auth.users to app_users by email match.
create or replace function link_app_user_on_signin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.app_users
  set    auth_user_id = new.id
  where  lower(email) = lower(new.email)
    and  auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function link_app_user_on_signin();

-- Backfill: any auth.users that already exist get linked now.
update public.app_users a
set auth_user_id = u.id
from auth.users u
where lower(a.email) = lower(u.email)
  and a.auth_user_id is null;
