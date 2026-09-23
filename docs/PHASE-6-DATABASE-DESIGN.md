# Phase 6 — Database Design

Status: IMPLEMENTED
Phase: 6

## Scope

This phase establishes the PostgreSQL/Supabase data model for TingTring Talk before authentication, calling, and production API features are implemented.

## Identity rules

- The TTT User ID is a unique 10-digit application identifier.
- It is not a phone number and is never treated as a cellular identity.
- Username is separate and globally unique/searchable.
- Display name is separate and non-unique.
- Email belongs to authentication/recovery and is not the calling identity.
- The database enforces the 10-digit TTT User ID format.

## Tables

- profiles — account identity, profile, status, and plan.
- devices — registered Android installations and push tokens.
- sessions — server-side session tracking/revocation metadata.
- contacts — server-side contact relationships/block state.
- calls — call session metadata only; no private audio/content.
- call_participants — users participating in each call.
- subscriptions — plan subscription records.
- entitlements — feature/plan grants, including owner grants.
- identity_reservations — reserved TTT IDs; server-only.
- reports — user reports and moderation workflow.
- notifications — in-app notification records.
- announcements — server announcements.
- audit_logs — privileged operational audit trail; server-only.
- feature_flags — server-controlled feature switches.
- temporary_users — temporary/pre-account identities; server-only.

Private saved contact names are deliberately not stored in this database; they remain local to the Android client.

## Security

- Row Level Security is enabled on every application table.
- Users can access only their own devices, sessions, contacts, subscriptions, entitlements, reports, and notifications.
- Call metadata is readable only to call participants.
- Identity reservations, audit logs, and temporary-user records have no client RLS policies and are intended for the server/service role.
- Supabase service-role credentials remain backend-only.
- No phone-number identity field is created.

## Phase 6 exit criteria

- [x] Initial relational schema created.
- [x] TTT 10-digit identity constraints created.
- [x] Core foreign keys and uniqueness constraints created.
- [x] Updated-at triggers created.
- [x] RLS enabled and baseline policies created.
- [x] Server-only operational tables separated from client access.
- [ ] Apply migration to the actual Supabase project and verify it there.

## Next

Phase 7 — Authentication and account lifecycle.
