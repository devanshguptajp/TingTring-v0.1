import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { validateEmail, normalizeEmail, validateUsername, validateDisplayName, publicProfile, authResponse, getAuthenticatedUser } from "../src/auth.js";

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
  const ownerCountWithoutSupabase = await fetch("http://127.0.0.1:3189/api/v1/owner/count", { headers: { Authorization: "Bearer fake" } });
  assert.equal(ownerCountWithoutSupabase.status, 503);
  assert.equal((await ownerCountWithoutSupabase.json()).error, "SUPABASE_NOT_CONFIGURED");
  const oversizedJson = await fetch("http://127.0.0.1:3189/api/v1/auth/otp/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x".repeat(40000) }) });
  assert.equal(oversizedJson.status, 413);
} finally {
  child.kill("SIGTERM");
  await sleep(100);
}
console.log("Phase 9 backend smoke tests passed.");
