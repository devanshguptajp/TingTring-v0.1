# Phase 18 — Push Notification Foundation

Status: CLIENT AND API FOUNDATION IMPLEMENTED — FIREBASE ACTIVATION PENDING

Implemented:
- Added Firebase Messaging SDK and Android messaging service.
- FCM token is persisted locally when Firebase supplies a token.
- Authenticated backend endpoint registers an Android device token against the signed-in profile and installation ID.
- Incoming data messages can display a high-importance notification that opens TingTring Talk.
- Notification channel and Android 13+ notification permission checks are present.

Required at final setup:
- Create/configure the Firebase Android app and add its `google-services.json`.
- Enable the Google Services Gradle plugin only after that configuration file exists.
- Configure a trusted backend FCM sender (service account credentials must remain server-side).
- Request notification permission at a suitable point in the user flow and register a fresh token after sign-in.

Limitations:
- No FCM message sender is enabled in the backend yet.
- Notification payloads currently open the app; they do not automatically accept a call or guarantee Telecom lock-screen presentation.
- Push delivery has not been tested on a physical device.
