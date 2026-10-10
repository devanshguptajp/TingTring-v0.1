# Phase 15 — Regression Tests & Functional Hardening

Status: REPOSITORY HARDENING ADDED — CI RESULTS PENDING

Implemented in the repository:
- Expanded backend smoke coverage for email, username and display-name validation boundaries.
- Added missing/invalid authorization-header checks.
- Added a safe configuration check for owner-only API behavior when Supabase is not configured.
- Added oversized JSON-body rejection coverage.
- Corrected the owner-count response field names to match the Android client contract (`owner_count`, `owner_limit`).
- Kept privileged owner operations server-authorized and password reauthentication server-side.

Still requires verification:
- Backend smoke tests must pass in GitHub Actions.
- Android build and emulator launch smoke tests must pass on the latest commit.
- Supabase migrations and RLS tests must be applied/run against the actual Supabase project.
- Live two-account call tests and owner grant limit tests remain external integration checks.
- No real push delivery, call quality, or lock-screen behavior is claimed until tested on device.
