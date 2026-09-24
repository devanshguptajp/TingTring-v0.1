-- Phase 14 consistency hardening
-- Restore the product invariant: every TingTring User ID is exactly 10 digits.
-- Migration 004 accidentally widened this invariant; this migration is the authoritative correction.

alter table public.profiles drop constraint if exists profiles_ttt_user_id_format;
alter table public.profiles add constraint profiles_ttt_user_id_format
  check (ttt_user_id ~ '^[0-9]{10}$');

alter table public.identity_reservations drop constraint if exists identity_reservations_format;
alter table public.identity_reservations add constraint identity_reservations_format
  check (ttt_user_id ~ '^[0-9]{10}$');

create or replace function public.generate_ttt_user_id()
returns text
language plpgsql
volatile
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    exit when not exists (
      select 1 from public.profiles where ttt_user_id = candidate
    ) and not exists (
      select 1 from public.identity_reservations where ttt_user_id = candidate
    );
  end loop;
  return candidate;
end;
$$;

create index if not exists profiles_ttt_user_id_idx on public.profiles(ttt_user_id);
