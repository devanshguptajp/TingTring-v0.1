-- Phases 24-25: snapshot plan limits and track dynamic Owner-call override.
-- Apply after migrations 001 through 007.
alter table public.calls
  add column if not exists duration_limit_seconds integer,
  add column if not exists owner_override_active boolean not null default false,
  add column if not exists effective_plan text not null default 'FREE',
  add column if not exists ended_reason text;

alter table public.calls
  drop constraint if exists calls_duration_limit_positive;
alter table public.calls
  add constraint calls_duration_limit_positive
  check (duration_limit_seconds is null or duration_limit_seconds > 0);

create index if not exists calls_active_duration_idx
  on public.calls (status, started_at)
  where status = 'ACCEPTED';
