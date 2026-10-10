# Phase 19 — Video Call Controls

Status: VIDEO SESSION AND CAMERA PUBLISHING IMPLEMENTED — REMOTE VIDEO RENDERING PENDING

Implemented:
- Contact rows expose a Video action that requests a VIDEO call session from the backend.
- Telecom outgoing-call metadata includes the requested video state.
- The call screen requests camera permission only when the user turns the camera on.
- Camera enable/disable is wired to LiveKit local-participant camera publishing.
- Microphone mute, call duration, connection timeout, retry and end-call controls remain available during video sessions.

Still required:
- Add local and remote video render surfaces and participant layout.
- Verify camera lifecycle, camera switching, orientation and permission denial on supported devices.
- Verify two-way video with two authenticated clients against the configured LiveKit service.

This phase must not be described as full video calling until remote video rendering and two-device tests pass.
