# Phase 6 — Database Design

Status: SCHEMA + SECURITY IMPLEMENTED — LIVE SUPABASE APPLY PENDING
Phase: 6

Implemented:
- Full PostgreSQL/Supabase relational schema.
- Flexible 3–30 character TTT identity constraints, with automatic 3-letter + 8-digit generation.
- Username/display-name constraints.
- Contacts, calls, participants, subscriptions, entitlements, notifications, audit and operational tables.
- Foreign keys, uniqueness, indexes and update triggers.
- RLS enabled across application tables.
- Hardened profile policy in migration 002.
- Phase 6 pgTAP regression assertions in supabase/tests/phase6_rls.test.sql.
- TTT ID generation hardened so IDs reserved after account deletion cannot be generated again.

Repository implementation additions: flexible ID migration and reservation rules.\n\nExternal verification still required:
- Apply migrations 001, 002 and 003 to the real Supabase project.
- Run Supabase database tests there and fix any environment-specific failures.
