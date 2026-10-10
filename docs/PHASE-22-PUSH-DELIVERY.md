# Phase 22 — Incoming Call Push Delivery

Status: SERVER IMPLEMENTATION ADDED — FIREBASE CONFIGURATION REQUIRED

Implemented:
- Backend uses Firebase Admin SDK when `FIREBASE_SERVICE_ACCOUNT_JSON` is configured.
- New audio, video and group-call invitations send high-priority, data-only FCM messages to active device tokens.
- Payload includes the call ID, call type, room name, title and caller display name.
- Invalid/unregistered device tokens are marked inactive.
- Push failures do not prevent the backend from retaining its in-app notification record; errors are logged server-side.
- `backend/.env.example` documents the optional server credential.

Setup still required:
1. Create/configure a Firebase project and register the Android app ID `com.tingtring.talk`.
2. Add the Firebase Android configuration and Gradle plugin as required by Firebase's current Android setup.
3. Store the Firebase service-account JSON as the hosting provider's secret environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`; never commit it.
4. Set the same Firebase project for the Android app and backend, deploy, then test with two real devices.

Current limitation:
- FCM cannot deliver until Firebase Android configuration and the backend service-account secret are supplied. The Android client currently opens the app from a push notification; Telecom full-screen incoming-call behavior while the app is killed/locked still needs device-level verification.
