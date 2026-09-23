alter table public.profiles drop constraint if exists profiles_ttt_user_id_format;
alter table public.profiles add constraint profiles_ttt_user_id_format check (ttt_user_id ~ '^[a-z0-9_]{3,30}$');
alter table public.identity_reservations drop constraint if exists identity_reservations_format;
alter table public.identity_reservations add constraint identity_reservations_format check (ttt_user_id ~ '^[a-z0-9_]{3,30}$');
create index if not exists profiles_ttt_user_id_lower_idx on public.profiles (lower(ttt_user_id));
create or replace function public.generate_ttt_user_id()
returns text language plpgsql volatile as $$
declare candidate text;
begin
 loop
  candidate := substr('abcdefghijklmnopqrstuvwxyz', floor(random()*26)::int+1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', floor(random()*26)::int+1, 1)
    || substr('abcdefghijklmnopqrstuvwxyz', floor(random()*26)::int+1, 1)
    || lpad((floor(random()*100000000))::bigint::text, 8, '0');
  exit when not exists (select 1 from public.profiles where lower(ttt_user_id)=lower(candidate))
    and not exists (select 1 from public.identity_reservations where lower(ttt_user_id)=lower(candidate));
 end loop;
 return candidate;
end;
$$;