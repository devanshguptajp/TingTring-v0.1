export const PLAN_ENTITLEMENTS = Object.freeze({
  FREE: Object.freeze({ maxDurationSeconds: 45 * 60, maxParticipants: 4 }),
  PRO: Object.freeze({ maxDurationSeconds: 150 * 60, maxParticipants: 10 }),
  PREMIUM: Object.freeze({ maxDurationSeconds: 240 * 60, maxParticipants: 25 }),
  OWNER: Object.freeze({ maxDurationSeconds: null, maxParticipants: 25 })
});

export const OWNER_OVERRIDE_USERNAME = "dev17112012";

export function planEntitlement(plan) {
  const normalized = typeof plan === "string" ? plan.toUpperCase() : "FREE";
  return PLAN_ENTITLEMENTS[normalized] || PLAN_ENTITLEMENTS.FREE;
}

export function isOverrideOwner(profile) {
  return profile?.plan === "OWNER" &&
    typeof profile.username === "string" &&
    profile.username.toLowerCase() === OWNER_OVERRIDE_USERNAME;
}

export function callEntitlement(callerProfile, activeParticipants = []) {
  const callerPlan = typeof callerProfile?.plan === "string" ? callerProfile.plan.toUpperCase() : "FREE";
  const ownerOverride = activeParticipants.some(isOverrideOwner);
  const base = planEntitlement(callerPlan);
  return {
    effectivePlan: ownerOverride ? "OWNER" : callerPlan,
    maxDurationSeconds: ownerOverride ? null : base.maxDurationSeconds,
    maxParticipants: ownerOverride ? 25 : base.maxParticipants,
    ownerOverride,
    features: { voiceCalls: true, videoCalls: true, groupCalls: true }
  };
}

export function groupParticipantLimit(callerProfile, invitedProfiles = []) {
  if (isOverrideOwner(callerProfile) || invitedProfiles.some(isOverrideOwner)) return 25;
  return planEntitlement(callerProfile?.plan).maxParticipants;
}
