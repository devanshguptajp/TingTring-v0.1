# TingTring Talk Backend

Node.js API for TingTring Talk. It handles Supabase authentication/profile access, contacts, call coordination, owner-only account management, FCM call invitations, and LiveKit room tokens.

## Run locally

```sh
npm install
npm run check
npm test
npm start
```

## Required hosting secrets

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY — backend only; never put this key in Android or commit it.
- LIVEKIT_URL
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- INITIAL_OWNER_EMAIL — exact verified email for the first owner bootstrap.
- FIREBASE_SERVICE_ACCOUNT_JSON — optional until push delivery is configured.

## Supabase setup

Apply migrations in numeric order, 001 through 008, from the repository's supabase/migrations directory. Phase 24–25 adds migration 008 for per-call duration limits, effective plan snapshots, and Owner override tracking.

After configuring the secrets, sign up and verify the email configured as INITIAL_OWNER_EMAIL, then use Profile → Activate Owner Console. The first-owner bootstrap is allowed only while no Owner exists.

## Plan enforcement

- Free: 45-minute maximum call duration; up to 4 people per group.
- Pro: 150-minute maximum call duration; up to 10 people per group.
- Premium: 240-minute maximum call duration; up to 25 people per group.
- Owner: unlimited duration; up to 25 people per group.
- The designated account (username dev17112012 with an OWNER profile) dynamically grants unlimited duration and the 25-person group limit while it is actively participating. Other users' saved plans are not changed.

The backend checks duration limits and attempts to close the associated LiveKit room. Android also displays the effective limit and ends the call when the local timer reaches it.

Subscription payment processing is not included; Pro/Premium access is managed through the owner console until a payment system is implemented.
