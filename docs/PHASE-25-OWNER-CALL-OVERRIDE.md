# Phase 25 — Owner call override

The designated owner account is identified server-side by both profiles.plan = OWNER and username dev17112012. The Android app cannot self-assign this identity.

When this owner is an active participant:
- The call's effective plan becomes OWNER.
- The call duration becomes unlimited while the owner remains active.
- Group calls may contain up to 25 participants, including the caller.
- Other participants' stored plans are not changed.

If the owner leaves a group call, the backend returns to the creator's normal plan duration limit. Elapsed call time is not reset. The backend sweep ends an over-limit call even if the Android timer is paused or the app is backgrounded.

Owner status is evaluated from Supabase profiles and participant rows. The owner override does not create permanent Pro/Premium subscriptions or edit another user's plan.

## Automated regression coverage
The backend smoke suite verifies that the designated owner has unlimited duration, that a designated owner as an active participant overrides Free/Pro call limits, that unrelated OWNER accounts do not trigger the designated-owner override, and that group participant caps follow the owner override.

## Manual integration verification
Use a designated Owner test account plus Free, Pro, and Premium accounts. Test owner as caller, callee, and group participant; then have the owner leave a group and confirm the creator's original limit resumes. Confirm non-owner calls and stored plan values are unchanged.
