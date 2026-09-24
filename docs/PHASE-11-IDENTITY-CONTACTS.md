# Phase 11 — Identity, Profiles, Contacts & Search

Status: IMPLEMENTED IN REPOSITORY — LIVE DATABASE VERIFICATION PENDING

Implemented:
- Authenticated directory search by username prefix or exact TingTring ID.
- Contact list, add and remove APIs.
- Self-call/self-contact safeguards.
- Active-account filtering.
- Server-side authorization through the authenticated backend.
- Android search and contacts UI with animated Vanya fields.
- Profile editing for username/display name with server-side uniqueness validation.
- Profile identity card clearly separates the permanent 10-digit TTT ID from editable username/display name.
- TTT identity remains distinct from phone numbers; every TTT User ID is exactly 10 digits and is globally unique. Old IDs remain reserved when an owner changes an ID.
- Database indexes for TTT ID and contact lookup.

Repository implementation additions: flexible IDs and old-ID aliases.\n\nRemaining external verification:
- Apply Supabase migrations 001, 002 and 003 to the real project.
- Create two real accounts and verify search/add/remove end-to-end.
