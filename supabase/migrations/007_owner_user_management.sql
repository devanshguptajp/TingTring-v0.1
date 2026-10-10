-- Phase 24: owner dashboard and subscription administration
-- Existing installations can safely apply this migration once.
alter type public.plan_type add value if not exists 'PREMIUM';
