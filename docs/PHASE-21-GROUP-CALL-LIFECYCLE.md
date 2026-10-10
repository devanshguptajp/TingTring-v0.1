# Phase 21 — Group Call Lifecycle

Status: IMPLEMENTED IN REPOSITORY — LIVE MULTI-DEVICE TESTING PENDING

Implemented:
- Added a membership-protected participant roster endpoint.
- Group participants can leave without ending the call for everyone.
- Only the group caller can end the entire group call.
- A participant can decline a ringing group invitation without automatically terminating invitations to other people.
- If no invitees remain ringing or accepted, the backend closes the group call and marks the caller's participant state ended.
- The call screen refreshes the group roster while connected and shows participant display names and states.
- Group-call screen actions distinguish “Leave group” from “End group call”.

Important limits:
- The participant list is refreshed by polling, not a realtime subscription.
- Races between simultaneous leave/decline/accept actions still require live database testing.
- The caller is currently responsible for ending the full group call; a disconnected caller is not yet handled by a server-side timeout job.
