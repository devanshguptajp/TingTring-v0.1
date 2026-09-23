# Phase 9 — Verification & Integration Harness

Status: IMPLEMENTED — LIVE SERVICE VERIFICATION PENDING
Phase: 9

## Purpose

Close the verification gaps left by Phases 3, 6, and 7 as far as repository automation can safely do without production credentials.

## Implemented

- Added an Android emulator smoke-test workflow.
- The emulator test builds, installs, launches the real TingTring Talk APK, verifies MainActivity is active, and verifies the app process is running.
- Added backend smoke tests using Node assertions and fetch.
- Backend smoke tests cover validation helpers, public-profile privacy, auth-response shape, health, API root, and 404 behavior.
- Backend CI now exposes npm test.
- Existing SQL migrations remain the source of truth for Phase 6 schema and RLS.

## External verification still required

These cannot be honestly marked complete from repository CI alone:

1. Install and launch the APK on a physical Android phone for the Phase 3 final sanity check.
2. Apply 001_initial_schema.sql and 002_phase7_security.sql to the actual Supabase project and verify tables, constraints, RLS, and directory search there.
3. Configure Supabase Auth and email settings in the actual project.
4. Run live signup, email OTP verification, password login, refresh, logout, profile update, password reset, and account deletion against the deployed backend.

No Supabase service-role key or other production secret is committed.

## Exit criteria

- [x] Android emulator verification added.
- [x] Backend smoke testing added.
- [x] CI wiring added.
- [x] Remaining external blockers documented.
- [ ] Physical-device verification.
- [ ] Actual Supabase migration verification.
- [ ] Live Supabase Auth end-to-end verification.

Phase 10 may proceed with Android UI/auth implementation, but it must not claim live authentication works until the live checks above pass.
