-- Phase 24: owner dashboard and subscription administration
-- Existing installations can safely apply this migration once.
alter type public.plan_type add value if not exists 'PREMIUM';

-- Bootstrap exactly one first owner atomically. This shares the lock used by grant_owner_role.
create or replace function public.bootstrap_initial_owner(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare owner_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('tingtring_owner_grant'));
  select count(*) into owner_count from public.profiles where plan = 'OWNER';
  if owner_count <> 0 then return false; end if;
  update public.profiles
    set plan = 'OWNER'
    where id = target_user_id and status = 'ACTIVE' and plan <> 'OWNER';
  return found;
end;
$$;

revoke all on function public.bootstrap_initial_owner(uuid) from public;
