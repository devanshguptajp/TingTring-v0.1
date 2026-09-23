# Phase 5 — Backend Foundation

Status: COMPLETE

## Implemented
- Dedicated Node.js 20+ backend under backend/.
- Express API foundation.
- Health and versioned API endpoints.
- Environment-based configuration.
- Supabase server-client foundation using the service-role key only on the backend.
- Helmet, CORS, JSON body-size limit, and basic rate limiting.
- Render deployment definition.
- Backend GitHub Actions check.
- Secrets excluded from Git.

## Deferred
Authentication, users, database tables, calling sessions, LiveKit tokens, and payments belong to later phases.

## Security boundary
The Android app must never contain the Supabase service-role key.

## Next
Phase 6 — Database Design.