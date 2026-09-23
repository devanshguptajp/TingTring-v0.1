# Phase 11 — Identity, Profiles, Contacts & Search

Status: IMPLEMENTED IN REPOSITORY — LIVE DATABASE VERIFICATION PENDING

Implemented:
- Authenticated directory search by username prefix or exact TingTring ID.
- Contact list, add and remove APIs.
- Self-call/self-contact safeguards.
- Active-account filtering.
- Server-side authorization through the authenticated backend.
- Android search and contacts UI.
- Flexible TTT identity remains distinct from phone numbers; generated IDs use 3 lowercase letters plus 8 digits, while owner-assigned IDs may use any valid 3–30 character lowercase ID.
- Database indexes for TTT ID and contact lookup.

Repository implementation additions: flexible IDs and old-ID aliases.\n\nRemaining external verification:
- Apply Supabase migrations 001, 002 and 003 to the real project.
- Create two real accounts and verify search/add/remove end-to-end.
