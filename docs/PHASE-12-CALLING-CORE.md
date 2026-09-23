# Phase 12 — Calling Core

Status: OUTGOING AUDIO CALL CORE IMPLEMENTED — LIVE CALL VERIFICATION PENDING

Implemented:
- LiveKit Android 2.29.0.
- LiveKit Node server SDK 2.19.1.
- Backend short-lived LiveKit token generation.
- Authenticated call-start and call-end APIs.
- Authenticated callee accept/decline APIs.
- Caller/callee database participant records.
- Incoming-call notification record creation.
- Android microphone permission request.
- Android LiveKit room connect/disconnect lifecycle.
- Mute/unmute.
- Contacts/search Call action.
- No LiveKit secret in Android.

Still required:
- LiveKit deployment/configuration.
- Push delivery to wake the callee.
- Incoming-call UI accepting/declining from notification.
- Two-device end-to-end test.
- Full video rendering/camera flow.
