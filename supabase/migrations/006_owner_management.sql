-- Phase 14 owner-management hardening
create or replace function public.grant_owner_role(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare owner_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('tingtring_owner_grant'));
  select count(*) into owner_count from public.profiles where plan = 'OWNER';
  if owner_count >= 5 then return false; end if;
  update public.profiles set plan = 'OWNER' where id = target_user_id and status = 'ACTIVE' and plan <> 'OWNER';
  return found;
end;
$$;

revoke all on function public.grant_owner_role(uuid) from public;
