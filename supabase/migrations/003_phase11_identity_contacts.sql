-- Phase 11 identity/directory/contact hardening
create index if not exists profiles_ttt_user_id_idx on public.profiles(ttt_user_id);
create index if not exists contacts_owner_created_idx on public.contacts(owner_user_id,created_at desc);


-- Make the invariant explicit for future schema checks.
create index if not exists profiles_status_username_idx
  on public.profiles(status, lower(username));
