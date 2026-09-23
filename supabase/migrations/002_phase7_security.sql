-- TingTring Talk — Phase 6 security hardening
drop policy if exists profiles_select_authenticated on public.profiles;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create or replace function public.search_profile_directory(search_text text)
returns table (
  id uuid,
  ttt_user_id text,
  username text,
  display_name text,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.ttt_user_id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.status = 'ACTIVE'
    and auth.uid() is not null
    and (
      lower(p.username) like lower(search_text) || '%'
      or p.ttt_user_id = search_text
    )
  order by lower(p.username)
  limit 25;
$$;

revoke all on function public.search_profile_directory(text) from public;
grant execute on function public.search_profile_directory(text) to authenticated;
