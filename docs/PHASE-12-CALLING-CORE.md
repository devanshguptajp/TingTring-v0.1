# Phase 12 — Calling Core

Status: CORE FOUNDATION IMPLEMENTED — LIVE CALL VERIFICATION PENDING

Implemented:
- LiveKit Android SDK dependency.
- LiveKit server SDK dependency.
- Secure backend call-start endpoint.
- Short-lived LiveKit room token generation on the backend only.
- Opaque LiveKit participant identity based on the authenticated user UUID.
- Audio/video call type selection in the call-start API.
- Call and participant records created in PostgreSQL.
- Authenticated call-end endpoint.
- Android microphone/camera/Bluetooth permission declarations.

Remaining:
- Runtime permission UX.
- Incoming-call push delivery.
- Android Telecom ConnectionService/PhoneAccount.
- Full in-call UI and LiveKit Room lifecycle integration.
- Two-device end-to-end call test against a configured LiveKit deployment.

Secrets are not stored in Android.
