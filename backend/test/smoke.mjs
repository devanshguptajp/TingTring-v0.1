import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { validateEmail, normalizeEmail, validateUsername, validateDisplayName, publicProfile, authResponse, getAuthenticatedUser } from "../src/auth.js";
import { callEntitlement, groupParticipantLimit, planEntitlement } from "../src/entitlements.js";


assert.equal(planEntitlement("FREE").maxDurationSeconds, 2700);
assert.equal(planEntitlement("FREE").maxParticipants, 4);
assert.equal(planEntitlement("PRO").maxDurationSeconds, 9000);
assert.equal(planEntitlement("PRO").maxParticipants, 10);
assert.equal(planEntitlement("PREMIUM").maxDurationSeconds, 14400);
assert.equal(planEntitlement("PREMIUM").maxParticipants, 25);
assert.equal(planEntitlement("OWNER").maxDurationSeconds, null);
assert.equal(planEntitlement("OWNER").maxParticipants, 25);
const freeCaller = { plan: "FREE", username: "ordinary_user" };
const designatedOwner = { plan: "OWNER", username: "dev17112012" };
assert.equal(callEntitlement(freeCaller, []).maxDurationSeconds, 2700);
assert.equal(callEntitlement(freeCaller, []).effectivePlan, "FREE");
assert.equal(callEntitlement(freeCaller, [designatedOwner]).ownerOverride, true);
assert.equal(callEntitlement(freeCaller, [designatedOwner]).maxDurationSeconds, null);
assert.equal(callEntitlement(freeCaller, [designatedOwner]).effectivePlan, "OWNER");
assert.equal(callEntitlement(freeCaller, [designatedOwner]).maxParticipants, 25);
assert.equal(callEntitlement(freeCaller, [{ plan: "owner", username: "DEV17112012" }]).ownerOverride, true);
assert.equal(callEntitlement(designatedOwner, [designatedOwner]).ownerOverride, true);
assert.equal(callEntitlement(designatedOwner, [designatedOwner]).maxDurationSeconds, null);
assert.equal(callEntitlement({ plan: "FREE", username: "someone_else" }, [{ plan: "OWNER", username: "another_owner" }]).ownerOverride, false);
assert.equal(callEntitlement({ plan: "FREE", username: "someone_else" }, [{ plan: "OWNER", username: "another_owner" }]).maxDurationSeconds, 2700);
assert.equal(callEntitlement({ plan: "PRO", username: "ordinary_pro" }, [designatedOwner]).maxDurationSeconds, null);
assert.equal(callEntitlement(freeCaller, [{ plan: "PRO", username: "ordinary_pro" }]).maxDurationSeconds, 2700);
assert.equal(groupParticipantLimit(freeCaller, []), 4);
assert.equal(groupParticipantLimit(freeCaller, [designatedOwner]), 25);
assert.equal(groupParticipantLimit(designatedOwner, []), 25);

assert.equal(validateEmail("User@Example.com"), true);
assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
assert.equal(validateEmail("not-an-email"), false);
assert.equal(validateUsername("devansh_123"), true);
assert.equal(validateUsername("Bad Name"), false);
assert.equal(validateUsername("ab"), false);
assert.equal(validateUsername("UpperCase"), false);
assert.equal(validateUsername("a".repeat(31)), false);
assert.equal(validateDisplayName("TingTring User"), true);
assert.equal(validateDisplayName(" "), false);
assert.equal(validateDisplayName("a".repeat(80)), true);
assert.equal(validateDisplayName("a".repeat(81)), false);
assert.deepEqual(await getAuthenticatedUser({}, undefined), { user: null, error: "MISSING_AUTHORIZATION" });
assert.deepEqual(await getAuthenticatedUser({}, "Basic abc"), { user: null, error: "MISSING_AUTHORIZATION" });

const profile = {
  id: "00000000-0000-0000-0000-000000000001",
  ttt_user_id: "1234567890",
  username: "devansh_123",
  display_name: "TingTring User",
  email: "private@example.com",
  status: "ACTIVE",
  plan: "FREE",
  avatar_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  last_seen_at: null
};
const safe = publicProfile(profile);
assert.equal("email" in safe, false);
assert.equal(safe.ttt_user_id, "1234567890");
assert.deepEqual(authResponse(null, profile).user, safe);

const child = spawn(process.execPath, ["src/server.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: "3189", NODE_ENV: "test" },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", chunk => { output += chunk.toString(); });
child.stderr.on("data", chunk => { output += chunk.toString(); });

try {
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3189/health");
      if (response.ok) {
        ready = true;
        const body = await response.json();
        assert.equal(body.status, "ok");
        assert.equal(body.supabaseConfigured, false);
        break;
      }
    } catch {}
    await sleep(100);
  }
  assert.equal(ready, true, "Backend did not start: " + output);
  const api = await fetch("http://127.0.0.1:3189/api/v1");
  assert.equal(api.status, 200);
  assert.equal((await api.json()).name, "TingTring Talk API");
  const missing = await fetch("http://127.0.0.1:3189/does-not-exist");
  assert.equal(missing.status, 404);
  const groupCallWithoutSupabase = await fetch("http://127.0.0.1:3189/api/v1/calls/group", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer fake" },
    body: JSON.stringify({ ttt_user_ids: ["1234567890", "0987654321"] })
  });
  assert.equal(groupCallWithoutSupabase.status, 503);
  assert.equal((await groupCallWithoutSupabase.json()).error, "SUPABASE_NOT_CONFIGURED");
  for (const path of [
    "/api/v1/calls/00000000-0000-0000-0000-000000000001/participants",
    "/api/v1/calls/00000000-0000-0000-0000-000000000001/entitlements",
    "/api/v1/calls/00000000-0000-0000-0000-000000000001/leave",
    "/api/v1/calls/00000000-0000-0000-0000-000000000001/decline",
    "/api/v1/calls/00000000-0000-0000-0000-000000000001/end"
  ]) {
    const method = path.endsWith("/participants") || path.endsWith("/entitlements") ? "GET" : "POST";
    const response = await fetch("http://127.0.0.1:3189" + path, {
      method, headers: { Authorization: "Bearer fake" }
    });
    assert.equal(response.status, 503, "Protected call route must fail closed without Supabase: " + path);
    assert.equal((await response.json()).error, "SUPABASE_NOT_CONFIGURED");
  }
  for (const path of [
    "/api/v1/owner/bootstrap",
    "/api/v1/owner/dashboard",
    "/api/v1/owner/users/search?q=devansh",
    "/api/v1/owner/users/00000000-0000-0000-0000-000000000001/plan",
    "/api/v1/owner/users/00000000-0000-0000-0000-000000000001/status"
  ]) {
    const method = path.endsWith("/plan") || path.endsWith("/status") ? "PATCH" : path.endsWith("/bootstrap") ? "POST" : "GET";
    const response = await fetch("http://127.0.0.1:3189" + path, {
      method, headers: { Authorization: "Bearer fake", "Content-Type": "application/json" },
      body: method === "PATCH" ? JSON.stringify({ plan: "PRO", status: "SUSPENDED" }) : undefined
    });
    assert.equal(response.status, 503, "Owner management route must fail closed without Supabase: " + path);
    assert.equal((await response.json()).error, "SUPABASE_NOT_CONFIGURED");
  }
  const ownerCountWithoutSupabase = await fetch("http://127.0.0.1:3189/api/v1/owner/count", { headers: { Authorization: "Bearer fake" } });
  assert.equal(ownerCountWithoutSupabase.status, 503);
  assert.equal((await ownerCountWithoutSupabase.json()).error, "SUPABASE_NOT_CONFIGURED");
  const oversizedJson = await fetch("http://127.0.0.1:3189/api/v1/auth/otp/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x".repeat(40000) }) });
  assert.equal(oversizedJson.status, 413);
} finally {
  child.kill("SIGTERM");
  await sleep(100);
}
console.log("Backend smoke tests passed (health, auth validation, protected call routes, payload limits).");
