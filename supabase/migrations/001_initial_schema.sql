-- TingTring Talk — Phase 6 initial database schema
-- PostgreSQL / Supabase
-- TTT User ID is an app identity, NOT a phone-number field.

create extension if not exists pgcrypto;

create type public.account_status as enum ('ACTIVE','SUSPENDED','DELETED');
create type public.plan_type as enum ('FREE','PRO','OWNER');
create type public.call_type as enum ('AUDIO','VIDEO','GROUP');
create type public.call_status as enum ('RINGING','ACCEPTED','DECLINED','MISSED','ENDED','CANCELLED','FAILED');
create type public.participant_role as enum ('CALLER','CALLEE','PARTICIPANT');
create type public.report_status as enum ('OPEN','REVIEWING','RESOLVED','DISMISSED');
create type public.entitlement_status as enum ('ACTIVE','EXPIRED','REVOKED');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
    );
  end loop;
  return candidate;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ttt_user_id text not null unique default public.generate_ttt_user_id(),
  username text not null unique,
  display_name text not null,
  email text,
  status public.account_status not null default 'ACTIVE',
  plan public.plan_type not null default 'FREE',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint profiles_ttt_user_id_format check (ttt_user_id ~ '^[0-9]{10}$'),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80)
);

create index profiles_username_lower_idx on public.profiles (lower(username));
create index profiles_status_idx on public.profiles (status);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  platform text not null default 'ANDROID',
  push_token text,
  app_version text,
  device_model text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

create index devices_user_active_idx on public.devices (user_id, is_active);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index sessions_user_idx on public.sessions (user_id);
create index sessions_active_idx on public.sessions (user_id, revoked_at, expires_at);

-- Server-side contact relationships. Private saved contact names remain local to Android.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, contact_user_id),
  constraint contacts_not_self check (owner_user_id <> contact_user_id)
);

create index contacts_owner_idx on public.contacts (owner_user_id);
create index contacts_contact_idx on public.contacts (contact_user_id);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  call_type public.call_type not null default 'AUDIO',
  status public.call_status not null default 'RINGING',
  livekit_room_name text unique,
  started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calls_creator_created_idx on public.calls (created_by, created_at desc);
create index calls_status_idx on public.calls (status);

create table public.call_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.participant_role not null,
  status public.call_status not null default 'RINGING',
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (call_id, user_id)
);

create index call_participants_user_idx on public.call_participants (user_id, created_at desc);
create index call_participants_call_idx on public.call_participants (call_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan public.plan_type not null,
  provider text,
  provider_subscription_id text,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  status public.entitlement_status not null default 'ACTIVE',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index entitlements_user_feature_idx on public.entitlements (user_id, feature_key, status);

create table public.identity_reservations (
  ttt_user_id text primary key,
  reserved_for_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint identity_reservations_format check (ttt_user_id ~ '^[0-9]{10}$')
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  category text not null,
  description text not null,
  status public.report_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_reporter_idx on public.reports (reporter_user_id, created_at desc);
create index reports_status_idx on public.reports (status);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.temporary_users (
  id uuid primary key default gen_random_uuid(),
  ttt_user_id text unique,
  device_fingerprint text,
  status public.account_status not null default 'ACTIVE',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint temporary_users_ttt_id_format check (ttt_user_id is null or ttt_user_id ~ '^[0-9]{10}$')
);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger devices_updated_at before update on public.devices for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger calls_updated_at before update on public.calls for each row execute function public.set_updated_at();
create trigger reports_updated_at before update on public.reports for each row execute function public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger feature_flags_updated_at before update on public.feature_flags for each row execute function public.set_updated_at();
create trigger temporary_users_updated_at before update on public.temporary_users for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.sessions enable row level security;
alter table public.contacts enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.identity_reservations enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.feature_flags enable row level security;
alter table public.temporary_users enable row level security;

create policy profiles_select_authenticated on public.profiles for select to authenticated using (status <> 'DELETED');
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy devices_owner_all on public.devices for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_owner_select on public.sessions for select to authenticated using (user_id = auth.uid());
create policy contacts_owner_all on public.contacts for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy calls_participant_select on public.calls for select to authenticated using (exists (select 1 from public.call_participants cp where cp.call_id = calls.id and cp.user_id = auth.uid()));
create policy call_participants_self_select on public.call_participants for select to authenticated using (user_id = auth.uid());
create policy subscriptions_self_select on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy entitlements_self_select on public.entitlements for select to authenticated using (user_id = auth.uid());
create policy reports_owner_select on public.reports for select to authenticated using (reporter_user_id = auth.uid());
create policy reports_owner_insert on public.reports for insert to authenticated with check (reporter_user_id = auth.uid());
create policy notifications_self_all on public.notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy announcements_read_active on public.announcements for select to authenticated using (is_active = true and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy feature_flags_read on public.feature_flags for select to authenticated using (true);

-- Operational/admin tables intentionally remain server-only through the backend service role.
