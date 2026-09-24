# Phase 12 — Calling Core

Status: REPOSITORY IMPLEMENTED — LIVE CALL VERIFICATION PENDING

Implemented:
- LiveKit Android 2.29.0 client integration.
- LiveKit Node server SDK 2.19.1.
- Short-lived LiveKit token generation on the backend only.
- Authenticated outgoing call-start API.
- Authenticated callee accept/decline APIs.
- Authenticated participant-only call-end API.
- Caller/callee database participant records.
- Incoming-call notification record creation.
- Android microphone permission request and runtime handling.
- Android LiveKit room connect/disconnect lifecycle.
- Microphone publish and mute/unmute.
- Android call screen with connection/error state.
- Contacts/search Call action.
- LiveKit server secrets kept out of the Android client.
- JitPack repository configured for the LiveKit Android dependency.

External verification still required:
- Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the backend.
- Apply/verify the Supabase schema in the real project.
- Run two authenticated Android clients against the same LiveKit deployment.
- Verify real microphone audio in both directions.
- Verify call acceptance, decline and end transitions.
- Verify a fresh Android build/emulator run after the latest commit.

Not part of Phase 12 completion:
- FCM push delivery/background wake-up.
- Lock-screen incoming-call UI.
- Full video rendering/camera flow.
- Group calling.
- Screen sharing.
