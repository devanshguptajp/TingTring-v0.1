# Phase 13 — Advanced Calling & Production Hardening

Status: FOUNDATION STARTED

Implemented in this pass:
- Backend CI runs syntax checks and smoke tests.
- Identity normalization is hardened.
- Opaque call room IDs are generated with node:crypto.
- Backend rate limiting, Helmet, CORS, request-size limits remain enabled.
- Directory responses never expose email.
- LiveKit credentials remain backend-only.

Not yet implemented:
- Group calling.
- Screen sharing.
- Android Telecom integration.
- Push notification delivery.
- Production abuse/security regression suite.
- Owner Console implementation.
- Final release hardening.
