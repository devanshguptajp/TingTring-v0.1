# Phase 20 — Group Call Foundation

Status: REPOSITORY FOUNDATION IMPLEMENTED — MULTI-DEVICE VERIFICATION PENDING

Implemented:
- Contacts screen lets a user select two or more saved contacts and start an audio group call.
- Backend accepts 2–7 invitees (up to 8 participants including the caller).
- Group room names are server-generated; LiveKit tokens are issued only by the backend.
- Participant records and incoming-call notification records are created for invitees.
- Accept API now supports group participants joining after the first participant has accepted.
- Group call requests validate participant count, TTT ID format, duplicate IDs and self-calls.

Still required:
- Configure Supabase and LiveKit and test 3+ authenticated clients concurrently.
- Add a participant roster, per-participant join/leave state and explicit group end/leave semantics.
- Test invitations when users are offline and resolve simultaneous accept/decline races against the live database.
- Group video is not implemented; group calling is audio-only in this phase.
