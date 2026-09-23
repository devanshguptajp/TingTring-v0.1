-- Phase 6 RLS regression assertions.
-- Run with Supabase CLI: supabase test db
begin;
select plan(8);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='profiles'),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='contacts'),
  'contacts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='calls'),
  'calls has RLS enabled'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='contacts_owner_all'),
  'contacts owner policy exists'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='calls' and policyname='calls_participant_select'),
  'call participant read policy exists'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_self'),
  'hardened profile policy exists'
);
select ok(
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='generate_ttt_user_id'),
  'TTT ID generator exists'
);
select ok(
  exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid
         join pg_namespace n on n.oid=r.relnamespace
         where n.nspname='public' and r.relname='profiles'
           and pg_get_constraintdef(c.oid) like '%ttt_user_id%10%'),
  'TTT ID format constraint exists'
);

select * from finish();
rollback;
