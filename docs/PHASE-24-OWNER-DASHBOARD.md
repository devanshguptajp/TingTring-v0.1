# Phase 24 — Owner dashboard and user management

## Added
- Owner-only in-app dashboard with user counts for total, active, suspended, Free, Pro, Premium, and Owner accounts.
- Latest 50 user records with username, TTT ID, display name, email, plan, status, creation time, and last-seen timestamp where available.
- Search by username prefix, exact TTT ID, or email.
- Owner actions to grant/revoke Pro and Premium (switch to Free), suspend/reactivate accounts, change a TTT ID, and grant Owner access with the existing 10-step confirmation and password re-authentication.
- Server-side authorization for every dashboard and mutation endpoint; owner plan/status changes are protected from ordinary user-management actions. Each plan/status change is written to the audit log.
- Suspended accounts are rejected by protected API routes and their active push devices are disabled.
- Migration `007_owner_user_management.sql` adds the Premium plan enum value.

## Endpoints
- `GET /api/v1/owner/dashboard`
- `PATCH /api/v1/owner/users/:userId/plan` — accepts `FREE`, `PRO`, `PREMIUM`
- `PATCH /api/v1/owner/users/:userId/status` — accepts `ACTIVE`, `SUSPENDED`

## Setup still required
1. Apply Supabase migrations in order, including `007_owner_user_management.sql`.
2. Configure the backend's Supabase URL and service-role key as hosting secrets. Never put the service-role key in the Android app or repository.
3. Set the backend secret `INITIAL_OWNER_EMAIL` to the exact email address you will use for your first owner account. Sign up with that email, verify it, then open **Profile → Activate Owner Console**. The server allows only that verified email to become the first owner, and the database function makes the first-owner claim atomic. If an owner already exists, an existing owner must grant further access.
4. Rebuild and install the Android app, then verify the dashboard and management actions with test accounts.

## Safety boundaries
- The dashboard lists at most the 50 newest non-deleted profiles, matching the intended initial private rollout size. Search can locate older profiles.
- The app does not permanently delete accounts from the console. Suspension is reversible and avoids accidental irreversible deletion.
- Email and account metadata are returned only from owner-protected backend routes.
