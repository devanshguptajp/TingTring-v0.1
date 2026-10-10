# Phase 14 — Android Telecom Call Flow

Status: REPOSITORY IMPLEMENTATION ADDED — CI AND DEVICE VERIFICATION PENDING

Implemented in the repository:
- Outgoing calls request an Android self-managed Telecom connection using the registered TingTring PhoneAccount.
- Telecom connection metadata carries the call ID and caller/callee display label.
- LiveKit connection state updates the Telecom connection lifecycle.
- Incoming-call polling hands detected calls to `TelecomManager.addNewIncomingCall` so Android can show its call UI.
- Telecom answer and reject events are bridged to the authenticated backend accept/decline APIs.
- Telecom disconnect cleans up unanswered incoming-call callbacks.
- A basic in-app accept/decline dialog remains as a fallback if adding the call to Telecom throws an error.

Still requires user/environment verification:
- A real Android device/emulator must show incoming Telecom UI correctly.
- Test answer, reject, disconnect, hold and Bluetooth/audio routing.
- Background and lock-screen delivery still requires a configured push provider and device-token registration; foreground polling alone does not wake a killed app.
- Verify behavior across two signed-in accounts and a configured LiveKit deployment.
- Validate Android 13+ notification behavior and device-specific Telecom restrictions.
