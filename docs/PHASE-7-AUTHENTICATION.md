# Phase 7 — Authentication and account lifecycle

Status: IMPLEMENTED IN REPOSITORY
Phase: 7

## Implemented
- Email/password signup and login.
- Email OTP/passwordless sign-in and verification.
- Bearer-token session validation and refresh-token exchange.
- Local-scope logout.
- Current-account and profile-update endpoints.
- Username validation and uniqueness enforcement.
- Password reset request and authenticated password update.
- Account deletion with permanent reservation of the deleted TTT User ID.
- No phone-number identity or phone OTP.
- Email excluded from directory search responses.

## API
- POST /api/v1/auth/signup
- POST /api/v1/auth/otp/start
- POST /api/v1/auth/otp/verify
- POST /api/v1/auth/login/password
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- PATCH /api/v1/profile
- POST /api/v1/auth/password/reset-request
- PATCH /api/v1/auth/password
- DELETE /api/v1/auth/account

## Live Supabase setup still required
Apply migrations 001 and 002 to the actual Supabase project, enable/configure email authentication and email templates, set backend secrets only in the deployment environment, then run live auth tests.

No production credentials are committed.
