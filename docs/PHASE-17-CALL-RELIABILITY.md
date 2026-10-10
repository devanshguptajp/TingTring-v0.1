# Phase 17 — Voice Call Reliability

Status: IMPLEMENTED IN REPOSITORY — NETWORK / DEVICE MATRIX PENDING

Implemented:
- Network availability is observed while a call screen is active; network loss/recovery is surfaced without immediately discarding the LiveKit room.
- Initial room connection has a 30-second timeout with a readable error.
- Connection failures have a retry action.
- Audio route changes are refreshed when Android reports communication-device changes.
- Audio mode and selected communication route are restored when the call screen is disposed.
- Microphone permission and network failure states are handled explicitly.
- The Android emulator workflow builds, installs and launches the app and checks for a process crash.

Manual test matrix still required:
- Wi-Fi to mobile data and mobile data to Wi-Fi while ringing and while connected.
- Airplane mode on/off, brief network outage, and longer outage.
- Microphone permission denied and later granted.
- Earpiece, speaker, wired headset, Bluetooth headset, incoming cellular call and app background/foreground.
- Repeated accept/decline/end actions and call timeout behavior on two signed-in devices.

Known limitation:
- This phase does not add FCM push delivery or guarantee incoming calls wake a killed/background app. Incoming-call polling remains foreground-only until push configuration and device-token registration are completed.
