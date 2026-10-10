# Phase 23 — Regression Hardening

Status: TESTS EXPANDED — CI RESULT MUST BE CHECKED

Implemented:
- Backend smoke tests now assert that group-call creation, participant roster, leave, decline and end routes fail closed with `503 SUPABASE_NOT_CONFIGURED` when the database service is not configured.
- Existing smoke coverage continues to validate health endpoints, auth validation, missing authentication parsing, unknown routes and oversized JSON bodies.
- Call membership is checked before returning participant details.
- Non-caller group participants cannot use the end-everyone endpoint.
- Server push delivery is optional and degrades to persisted in-app notifications when Firebase is not configured.

Required before release:
- Latest backend workflow green.
- Latest Android assembleDebug and emulator smoke workflow green.
- Apply repository SQL migrations to a test Supabase project.
- Test account A calling B, B declining/accepting, and three devices joining/leaving a group.
- Verify locked-screen and killed-app incoming-call behavior on physical Android devices.
- Configure Supabase, LiveKit, Firebase, and the deployed API base URL; the current Android API URL targets the emulator host.
