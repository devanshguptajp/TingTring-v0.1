# Phase 24 — Plan and entitlement system

## Plan limits
| Plan | Monthly price | Maximum call duration | Maximum group size |
|---|---:|---:|---:|
| Free | ₹0 | 45 minutes | 4 participants |
| Pro | ₹79/month | 150 minutes | 10 participants |
| Premium | ₹149/month | 240 minutes | 25 participants |
| Owner | Internal | Unlimited | 25 participants |

The backend calculates limits from the authenticated caller's server-side profile, not client-supplied plan claims. A group size includes the caller. Group requests that exceed the applicable limit are rejected before creating a call.

Call records snapshot the base duration limit. The backend periodically checks accepted calls and closes rooms that exceed their applicable limit. Android also shows the limit and ends locally when its timer reaches it; server enforcement remains authoritative.

Voice, video, and group-call capabilities are represented in the entitlement response. This phase does not implement payment processing or claim that not-yet-built screen sharing, caller effects, call backgrounds, or call-history UI are complete.

## Database setup
Apply supabase/migrations/008_phase24_25_call_entitlements.sql after migrations 001–007.

## Verification
Run npm test and npm run check in backend, then verify plan boundaries with real Supabase test accounts after the migration is applied.
