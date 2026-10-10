import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { callEntitlement, groupParticipantLimit, planEntitlement, isOverrideOwner } from "./entitlements.js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import {
  createAuthClient, getAuthenticatedUser, getProfile, ensureProfile,
  publicProfile, authResponse, normalizeEmail, validateEmail,
  validateUsername, validateDisplayName
} from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const webOrigin = process.env.WEB_ORIGIN || "*";
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: webOrigin === "*" ? true : webOrigin.split(",").map(v => v.trim()), credentials: webOrigin !== "*" }));
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseAdmin = supabaseConfigured ? createAuthClient(supabaseUrl, supabaseServiceRoleKey) : null;

async function requireOwner(req, res, next) {
  const profile = await getProfile(supabaseAdmin, req.authUser.id);
  if (!profile || profile.plan !== "OWNER") return res.status(403).json({ error: "OWNER_ONLY" });
  req.ownerProfile = profile;
  next();
}

function validTttUserId(value) { return typeof value === "string" && /^\d{10}$/.test(value); }
function validDirectoryQuery(value) { return typeof value === "string" && (/^\d{10}$/.test(value) || /^[a-z0-9_]{3,30}$/.test(value)); }

async function resolveTttUserId(value) {
  const normalized = value.trim().toLowerCase();
  const direct = await supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,status,plan,avatar_url").eq("ttt_user_id", normalized).eq("status", "ACTIVE").maybeSingle();
  if (direct.error) throw direct.error;
  if (direct.data) return direct.data;
  const alias = await supabaseAdmin.from("identity_reservations").select("reserved_for_user_id").eq("ttt_user_id", normalized).maybeSingle();
  if (alias.error) throw alias.error;
  if (!alias.data?.reserved_for_user_id) return null;
  const current = await supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,status,plan,avatar_url").eq("id", alias.data.reserved_for_user_id).eq("status", "ACTIVE").maybeSingle();
  if (current.error) throw current.error;
  return current.data || null;
}

function entitlementPayload(entitlement, call) {
  const startedAt = call?.started_at ? Date.parse(call.started_at) : NaN;
  const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  return {
    effective_plan: entitlement.effectivePlan,
    max_duration_seconds: entitlement.maxDurationSeconds,
    max_participants: entitlement.maxParticipants,
    owner_override: entitlement.ownerOverride,
    features: entitlement.features,
    call_status: call?.status || "UNKNOWN",
    elapsed_seconds: elapsedSeconds
  };
}

async function loadCallEntitlement(callId, userId) {
  const { data: call, error: callError } = await supabaseAdmin.from("calls")
    .select("id,created_by,call_type,status,started_at,livekit_room_name,duration_limit_seconds,effective_plan,owner_override_active")
    .eq("id", callId).maybeSingle();
  if (callError) throw callError;
  if (!call) return { error: "CALL_NOT_FOUND" };
  const { data: membership, error: membershipError } = await supabaseAdmin.from("call_participants")
    .select("id").eq("call_id", callId).eq("user_id", userId).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { error: "CALL_NOT_FOUND" };
  const callerProfile = await getProfile(supabaseAdmin, call.created_by);
  if (!callerProfile) return { error: "CALL_NOT_FOUND" };
  const { data: rows, error: participantsError } = await supabaseAdmin.from("call_participants")
    .select("user_id,role,status,user:user_id(id,username,plan)")
    .eq("call_id", callId);
  if (participantsError) throw participantsError;
  const activeProfiles = (rows || []).filter(row => row.status === "ACCEPTED" && row.user).map(row => row.user);
  const entitlement = callEntitlement(callerProfile, activeProfiles);
  if (call.owner_override_active !== entitlement.ownerOverride || call.effective_plan !== entitlement.effectivePlan) {
    const { error: updateError } = await supabaseAdmin.from("calls").update({
      owner_override_active: entitlement.ownerOverride, effective_plan: entitlement.effectivePlan
    }).eq("id", callId).in("status", ["RINGING", "ACCEPTED"]);
    if (updateError) throw updateError;
  }
  return { call, callerProfile, activeProfiles, entitlement };
}

async function enforceCallDurationLimits() {
  if (!supabaseAdmin) return;
  const { data: calls, error } = await supabaseAdmin.from("calls")
    .select("id,created_by,call_type,status,started_at,livekit_room_name,duration_limit_seconds,owner_override_active")
    .eq("status", "ACCEPTED").not("started_at", "is", null).limit(100);
  if (error) throw error;
  for (const call of calls || []) {
    const { data: rows, error: participantsError } = await supabaseAdmin.from("call_participants")
      .select("user_id,status,user:user_id(id,username,plan)")
      .eq("call_id", call.id);
    if (participantsError) throw participantsError;
    const activeProfiles = (rows || []).filter(row => row.status === "ACCEPTED" && row.user).map(row => row.user);
    const creator = await getProfile(supabaseAdmin, call.created_by);
    if (!creator) continue;
    const entitlement = callEntitlement(creator, activeProfiles);
    if (entitlement.ownerOverride) {
      if (!call.owner_override_active) {
        await supabaseAdmin.from("calls").update({ owner_override_active: true, effective_plan: "OWNER" })
          .eq("id", call.id).eq("status", "ACCEPTED");
      }
      continue;
    }
    if (call.owner_override_active) {
      await supabaseAdmin.from("calls").update({ owner_override_active: false, effective_plan: creator.plan })
        .eq("id", call.id).eq("status", "ACCEPTED");
    }
    const limitSeconds = call.duration_limit_seconds ?? planEntitlement(creator.plan).maxDurationSeconds;
    if (limitSeconds == null) continue;
    const startedAt = Date.parse(call.started_at || "");
    if (!Number.isFinite(startedAt) || (Date.now() - startedAt) / 1000 < limitSeconds) continue;
    const { data: ended, error: endError } = await supabaseAdmin.from("calls")
      .update({ status: "ENDED", ended_at: new Date().toISOString(), ended_reason: "PLAN_DURATION_LIMIT" })
      .eq("id", call.id).eq("status", "ACCEPTED").select("id").maybeSingle();
    if (endError) throw endError;
    if (!ended) continue;
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;
    if (livekitUrl && livekitKey && livekitSecret && call.livekit_room_name) {
      try {
        await new RoomServiceClient(livekitUrl, livekitKey, livekitSecret).deleteRoom(call.livekit_room_name);
      } catch (roomError) {
        console.error("Could not close LiveKit room after plan limit:", roomError?.message || roomError);
      }
    }
    const { error: participantEndError } = await supabaseAdmin.from("call_participants")
      .update({ status: "ENDED", left_at: new Date().toISOString() })
      .eq("call_id", call.id).eq("status", "ACCEPTED");
    if (participantEndError) console.error("Could not close call participant records:", participantEndError.message);
  }
}

let firebaseMessaging = undefined;
function getFirebaseMessaging() {
  if (firebaseMessaging !== undefined) return firebaseMessaging;
  firebaseMessaging = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const app = getApps().find(existing => existing.name === "ttt-push")
      || initializeApp({ credential: cert(serviceAccount) }, "ttt-push");
    firebaseMessaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase push is not configured correctly:", error?.message || error);
  }
  return firebaseMessaging;
}

async function sendCallPush(userIds, title, body, data) {
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging || !userIds.length) return;
    const { data: devices, error } = await supabaseAdmin.from("devices")
      .select("id,user_id,push_token").in("user_id", userIds).eq("is_active", true).not("push_token", "is", null);
    if (error) throw error;
    const rows = (devices || []).filter(device => typeof device.push_token === "string" && device.push_token.length > 20);
    if (!rows.length) return;
    const result = await messaging.sendEachForMulticast({
      tokens: rows.map(device => device.push_token),
      data: Object.fromEntries(Object.entries({ ...(data || {}), title, body }).map(([key, value]) => [key, String(value ?? "")])),
      android: { priority: "high", ttl: 60000 }
    });
    const staleTokens = [];
    result.responses.forEach((response, index) => {
      const code = response.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        staleTokens.push(rows[index].push_token);
      }
    });
    if (staleTokens.length) {
      const { error: disableError } = await supabaseAdmin.from("devices")
        .update({ is_active: false }).in("push_token", staleTokens);
      if (disableError) console.error("Could not disable stale push tokens:", disableError.message);
    }
  } catch (error) {
    // Calls still work through in-app notification polling if push delivery is unavailable.
    console.error("Call push delivery failed:", error?.message || error);
  }
}

function requireSupabase(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ error: "SUPABASE_NOT_CONFIGURED" });
  next();
}
function sendSupabaseError(res, error, fallback) {
  const message = error?.message || "";
  const status = /invalid login credentials|invalid otp|expired/i.test(message) ? 401 : 400;
  return res.status(status).json({ error: fallback || "AUTH_REQUEST_FAILED", message });
}
async function requireUser(req, res, next) {
  const result = await getAuthenticatedUser(supabaseAdmin, req.headers.authorization);
  if (!result.user) return res.status(401).json({ error: result.error });
  req.authUser = result.user;
  req.authToken = result.token;
  // Suspended accounts lose API access immediately; allow profile setup only when no profile exists yet.
  const profile = await getProfile(supabaseAdmin, result.user.id);
  if (profile && profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
  next();
}

app.get("/health", (_req, res) => res.status(200).json({
  service: "tingtring-talk-backend", status: "ok", version: "0.1.0",
  environment: process.env.NODE_ENV || "development", supabaseConfigured
}));
app.get("/api/v1", (_req, res) => res.status(200).json({ name: "TingTring Talk API", version: "v1", status: "online" }));
app.post("/api/v1/owner/bootstrap", requireSupabase, requireUser, async (req, res) => {
  try {
    const configuredEmail = normalizeEmail(process.env.INITIAL_OWNER_EMAIL || "");
    const signedInEmail = normalizeEmail(req.authUser.email || "");
    if (!configuredEmail) return res.status(503).json({ error: "OWNER_BOOTSTRAP_NOT_CONFIGURED" });
    if (!signedInEmail || signedInEmail !== configuredEmail) return res.status(403).json({ error: "OWNER_BOOTSTRAP_EMAIL_MISMATCH" });
    if (!req.authUser.email_confirmed_at) return res.status(403).json({ error: "OWNER_EMAIL_NOT_VERIFIED" });
    const profile = await getProfile(supabaseAdmin, req.authUser.id);
    if (!profile || profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    const { count, error: countError } = await supabaseAdmin.from("profiles")
      .select("id", { count: "exact", head: true }).eq("plan", "OWNER");
    if (countError) throw countError;
    if ((count || 0) > 0) return res.status(409).json({ error: "OWNER_ALREADY_INITIALIZED" });
    const { data: granted, error: grantError } = await supabaseAdmin.rpc("bootstrap_initial_owner", { target_user_id: req.authUser.id });
    if (grantError) throw grantError;
    if (!granted) return res.status(409).json({ error: "OWNER_BOOTSTRAP_FAILED" });
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: req.authUser.id, action: "INITIAL_OWNER_BOOTSTRAPPED",
      target_type: "PROFILE", target_id: req.authUser.id, metadata: { email: signedInEmail }
    });
    res.status(200).json({ status: "OWNER_BOOTSTRAPPED" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_BOOTSTRAP_FAILED" });
  }
});

app.get("/api/v1/health", (_req, res) => res.status(200).json({
  status: "ok", database: "foundation-ready", supabaseConfigured
}));

app.post("/api/v1/auth/signup", requireSupabase, async (req, res) => {
  try {
    const { email, password, display_name } = req.body || {};
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!validateEmail(normalizedEmail) || typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "INVALID_SIGNUP" });
    if (!validateUsername(username) || !validateDisplayName(display_name)) return res.status(400).json({ error: "INVALID_PROFILE" });
    const { data: conflict } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (conflict) return res.status(409).json({ error: "USERNAME_ALREADY_IN_USE" });
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: normalizedEmail, password,
      options: { data: { username, display_name: display_name.trim() } }
    });
    if (error) return sendSupabaseError(res, error, "SIGNUP_FAILED");
    if (!data.user) return res.status(400).json({ error: "SIGNUP_FAILED" });
    let profile = null;
    if (data.session) profile = await ensureProfile(supabaseAdmin, data.user, { username, display_name });
    res.status(201).json({
      status: data.session ? "SIGNED_IN" : "EMAIL_VERIFICATION_REQUIRED",
      ...authResponse(data.session, profile)
    });
  } catch (error) {
    if (error.code === "USERNAME_ALREADY_IN_USE") return res.status(409).json({ error: error.code });
    console.error(error); res.status(500).json({ error: "SIGNUP_FAILED" });
  }
});

app.post("/api/v1/auth/otp/start", requireSupabase, async (req, res) => {
  try {
    const { email, username, display_name, should_create_user = true } = req.body || {};
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!validateEmail(normalizedEmail)) return res.status(400).json({ error: "INVALID_EMAIL" });
    if (should_create_user) {
      if (!validateUsername(username) || !validateDisplayName(display_name)) return res.status(400).json({ error: "INVALID_PROFILE" });
      const { data: conflict } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
      if (conflict) return res.status(409).json({ error: "USERNAME_ALREADY_IN_USE" });
    }
    const { error } = await supabaseAdmin.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: should_create_user, data: should_create_user ? { username, display_name: display_name.trim() } : undefined }
    });
    if (error) return sendSupabaseError(res, error, "OTP_START_FAILED");
    res.status(202).json({ status: "OTP_SENT" });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "OTP_START_FAILED" });
  }
});

app.post("/api/v1/auth/otp/verify", requireSupabase, async (req, res) => {
  try {
    const { email, token } = req.body || {};
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!validateEmail(normalizedEmail) || typeof token !== "string" || !/^\d{6}$/.test(token)) return res.status(400).json({ error: "INVALID_OTP" });
    const { data, error } = await supabaseAdmin.auth.verifyOtp({ email: normalizedEmail, token, type: "email" });
    if (error) return sendSupabaseError(res, error, "INVALID_OTP");
    if (!data.user || !data.session) return res.status(401).json({ error: "OTP_VERIFICATION_FAILED" });
    let profile;
    try {
      profile = await ensureProfile(supabaseAdmin, data.user);
    } catch (profileError) {
      if (profileError.code === "PROFILE_SETUP_REQUIRED") {
        return res.status(409).json({ error: profileError.code, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      }
      throw profileError;
    }
    if (profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    res.status(200).json(authResponse(data.session, profile));
  } catch (error) {
    if (error.code === "PROFILE_SETUP_REQUIRED") return res.status(409).json({ error: error.code });
    if (error.code === "USERNAME_ALREADY_IN_USE") return res.status(409).json({ error: error.code });
    console.error(error); res.status(500).json({ error: "OTP_VERIFICATION_FAILED" });
  }
});

app.post("/api/v1/auth/login/password", requireSupabase, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!validateEmail(normalizedEmail) || typeof password !== "string" || !password) return res.status(400).json({ error: "INVALID_LOGIN" });
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) return sendSupabaseError(res, error, "INVALID_CREDENTIALS");
    if (!data.user || !data.session) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const profile = await ensureProfile(supabaseAdmin, data.user);
    if (profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    res.status(200).json(authResponse(data.session, profile));
  } catch (error) {
    if (error.code === "PROFILE_SETUP_REQUIRED") return res.status(409).json({ error: error.code });
    console.error(error); res.status(500).json({ error: "LOGIN_FAILED" });
  }
});

app.post("/api/v1/auth/refresh", requireSupabase, async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (typeof refresh_token !== "string" || !refresh_token) return res.status(400).json({ error: "INVALID_REFRESH_TOKEN" });
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
    if (error || !data.session || !data.user) return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    const profile = await ensureProfile(supabaseAdmin, data.user);
    if (profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    res.status(200).json(authResponse(data.session, profile));
  } catch (error) {
    console.error(error); res.status(500).json({ error: "REFRESH_FAILED" });
  }
});

app.post("/api/v1/auth/logout", requireSupabase, requireUser, async (req, res) => {
  try {
    const response = await fetch(supabaseUrl + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: supabaseServiceRoleKey, Authorization: "Bearer " + req.authToken }
    });
    if (!response.ok) return res.status(500).json({ error: "LOGOUT_FAILED" });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "LOGOUT_FAILED" });
  }
});

app.post("/api/v1/profile/setup", requireSupabase, requireUser, async (req, res) => {
  try {
    const { display_name } = req.body || {};
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (!validateUsername(username) || !validateDisplayName(display_name)) return res.status(400).json({ error: "INVALID_PROFILE" });
    const existing = await getProfile(supabaseAdmin, req.authUser.id);
    if (existing) return res.status(409).json({ error: "PROFILE_ALREADY_EXISTS", user: publicProfile(existing) });
    const { data: conflict } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (conflict) return res.status(409).json({ error: "USERNAME_ALREADY_IN_USE" });
    const profile = await ensureProfile(supabaseAdmin, req.authUser, { username, display_name });
    res.status(201).json({ user: publicProfile(profile) });
  } catch (error) {
    if (error.code === "USERNAME_ALREADY_IN_USE") return res.status(409).json({ error: error.code });
    console.error(error);
    res.status(500).json({ error: "PROFILE_SETUP_FAILED" });
  }
});

app.get("/api/v1/owner/dashboard", requireSupabase, requireUser, requireOwner, async (_req, res) => {
  try {
    const [users, active, suspended, free, pro, premium, owners] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url,created_at,last_seen_at").neq("status", "DELETED").order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "SUSPENDED"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "FREE").neq("status", "DELETED"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "PRO").neq("status", "DELETED"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "PREMIUM").neq("status", "DELETED"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "OWNER").neq("status", "DELETED")
    ]);
    for (const result of [users, active, suspended, free, pro, premium, owners]) {
      if (result.error) throw result.error;
    }
    res.status(200).json({
      users: users.data || [],
      counts: {
        total: (active.count || 0) + (suspended.count || 0),
        active: active.count || 0, suspended: suspended.count || 0,
        free: free.count || 0, pro: pro.count || 0, premium: premium.count || 0, owners: owners.count || 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_DASHBOARD_FAILED" });
  }
});

app.patch("/api/v1/owner/users/:userId/plan", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const plan = typeof req.body?.plan === "string" ? req.body.plan.toUpperCase() : "";
    if (!["FREE", "PRO", "PREMIUM"].includes(plan)) return res.status(400).json({ error: "INVALID_PLAN" });
    if (req.params.userId === req.authUser.id) return res.status(400).json({ error: "CANNOT_CHANGE_OWN_PLAN" });
    const { data: target, error: targetError } = await supabaseAdmin.from("profiles")
      .select("id,plan,status,username").eq("id", req.params.userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.status === "DELETED") return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.plan === "OWNER") return res.status(409).json({ error: "OWNER_PLAN_PROTECTED" });
    const { data, error } = await supabaseAdmin.from("profiles").update({ plan }).eq("id", target.id)
      .select("id,plan,status").single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: req.authUser.id, action: "USER_PLAN_CHANGED", target_type: "PROFILE",
      target_id: target.id, metadata: { from: target.plan, to: plan }
    });
    res.status(200).json({ user_id: data.id, plan: data.plan, status: data.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_PLAN_UPDATE_FAILED" });
  }
});

app.patch("/api/v1/owner/users/:userId/status", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const status = typeof req.body?.status === "string" ? req.body.status.toUpperCase() : "";
    if (!["ACTIVE", "SUSPENDED"].includes(status)) return res.status(400).json({ error: "INVALID_ACCOUNT_STATUS" });
    if (req.params.userId === req.authUser.id) return res.status(400).json({ error: "CANNOT_CHANGE_OWN_STATUS" });
    const { data: target, error: targetError } = await supabaseAdmin.from("profiles")
      .select("id,status,plan").eq("id", req.params.userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.status === "DELETED") return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.plan === "OWNER") return res.status(409).json({ error: "OWNER_STATUS_PROTECTED" });
    const { data, error } = await supabaseAdmin.from("profiles").update({ status }).eq("id", target.id)
      .select("id,status,plan").single();
    if (error) throw error;
    if (status === "SUSPENDED") {
      await supabaseAdmin.from("devices").update({ is_active: false }).eq("user_id", target.id);
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: req.authUser.id, action: "USER_STATUS_CHANGED", target_type: "PROFILE",
      target_id: target.id, metadata: { from: target.status, to: status }
    });
    res.status(200).json({ user_id: data.id, status: data.status, plan: data.plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_STATUS_UPDATE_FAILED" });
  }
});

app.get("/api/v1/owner/users/search", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    if (q.length < 3) return res.status(400).json({ error: "INVALID_QUERY" });
    const isId = /^[a-z0-9_]{3,30}$/.test(q);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && q.length <= 320;
    const isUsernamePrefix = /^[a-z0-9_]{3,30}$/.test(q);
    if (!isEmail && !isId && !isUsernamePrefix) return res.status(400).json({ error: "INVALID_QUERY" });
    let query = supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url")
      .limit(20);
    if (isEmail) query = query.ilike("email", q);
    else query = query.or("ttt_user_id.eq."+q+",username.ilike."+q+"%");
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "OWNER_SEARCH_FAILED" });
    return res.status(200).json({ results: data || [] });
  } catch {
    return res.status(500).json({ error: "OWNER_SEARCH_FAILED" });
  }
});

app.get("/api/v1/owner/count", requireSupabase, requireUser, requireOwner, async (_req, res) => {
  try {
    const { count, error } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("plan", "OWNER");
    if (error) throw error;
    res.status(200).json({ owner_count: count || 0, owner_limit: 5 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_COUNT_FAILED" });
  }
});

app.post("/api/v1/owner/users/:userId/grant", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const targetId = req.params.userId;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) return res.status(400).json({ error: "PASSWORD_REQUIRED" });
    if (req.body?.confirmation_count !== 10) return res.status(400).json({ error: "CONFIRMATIONS_REQUIRED" });
    if (targetId === req.authUser.id) return res.status(400).json({ error: "ALREADY_OWNER" });

    const { data: target, error: targetError } = await supabaseAdmin.from("profiles").select("id,username,display_name,plan,status").eq("id", targetId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.status !== "ACTIVE") return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.plan === "OWNER") return res.status(409).json({ error: "ALREADY_OWNER" });

    const { data: actorProfile, error: actorError } = await supabaseAdmin.from("profiles").select("email").eq("id", req.authUser.id).single();
    if (actorError) throw actorError;
    if (!actorProfile?.email) return res.status(400).json({ error: "OWNER_EMAIL_UNAVAILABLE" });

    const { data: authCheck, error: authError } = await supabaseAdmin.auth.signInWithPassword({ email: actorProfile.email, password });
    if (authError || !authCheck?.user) return res.status(401).json({ error: "PASSWORD_REAUTH_FAILED" });

    const { data: granted, error: updateError } = await supabaseAdmin.rpc("grant_owner_role", { target_user_id: targetId });
    if (updateError) throw updateError;
    if (!granted) return res.status(409).json({ error: "OWNER_LIMIT_REACHED_OR_USER_UNAVAILABLE" });
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: req.authUser.id,
      action: "OWNER_GRANTED",
      target_type: "PROFILE",
      target_id: targetId,
      metadata: { confirmation_count: 10 }
    });
    res.status(200).json({ status: "OWNER_GRANTED", user_id: target.id, display_name: target.display_name, username: target.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OWNER_GRANT_FAILED" });
  }
});

app.post("/api/v1/owner/users/:userId/ttt-id", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const newId = typeof req.body?.ttt_user_id === "string" ? req.body.ttt_user_id.trim().toLowerCase() : "";
    if (!validTttUserId(newId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
    const { data: target, error: targetError } = await supabaseAdmin.from("profiles").select("id,ttt_user_id,status").eq("id", req.params.userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.status === "DELETED") return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.ttt_user_id === newId) return res.status(400).json({ error: "TTT_USER_ID_UNCHANGED" });
    const existing = await supabaseAdmin.from("profiles").select("id").eq("ttt_user_id", newId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return res.status(409).json({ error: "TTT_USER_ID_ALREADY_IN_USE" });
    const reserved = await supabaseAdmin.from("identity_reservations").select("ttt_user_id").eq("ttt_user_id", newId).maybeSingle();
    if (reserved.error) throw reserved.error;
    if (reserved.data) return res.status(409).json({ error: "TTT_USER_ID_RESERVED" });
    const oldId = target.ttt_user_id;
    const reserveOld = await supabaseAdmin.from("identity_reservations").upsert({ ttt_user_id: oldId, reserved_for_user_id: target.id, reason: "ID_CHANGED" });
    if (reserveOld.error) throw reserveOld.error;
    const update = await supabaseAdmin.from("profiles").update({ ttt_user_id: newId }).eq("id", target.id);
    if (update.error) throw update.error;
    await supabaseAdmin.from("audit_logs").insert({ actor_user_id: req.authUser.id, action: "TTT_USER_ID_CHANGED", target_type: "PROFILE", target_id: target.id, metadata: { old_ttt_user_id: oldId, new_ttt_user_id: newId } });
    res.status(200).json({ user_id: target.id, old_ttt_user_id: oldId, ttt_user_id: newId, existing_contacts_follow_user: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "TTT_USER_ID_CHANGE_FAILED" });
  }
});

app.post("/api/v1/devices/push-token", requireSupabase, requireUser, async (req, res) => {
  try {
    const token = typeof req.body?.push_token === "string" ? req.body.push_token.trim() : "";
    const installationId = typeof req.body?.installation_id === "string" ? req.body.installation_id.trim() : "";
    if (token.length < 20 || token.length > 4096 || !/^[a-zA-Z0-9._:-]{8,128}$/.test(installationId)) {
      return res.status(400).json({ error: "INVALID_DEVICE_TOKEN" });
    }
    const { data, error } = await supabaseAdmin.from("devices").upsert({
      user_id: req.authUser.id,
      installation_id: installationId,
      platform: "ANDROID",
      push_token: token,
      is_active: true,
      last_seen_at: new Date().toISOString()
    }, { onConflict: "user_id,installation_id" }).select("id").single();
    if (error) throw error;
    return res.status(200).json({ status: "DEVICE_REGISTERED", device_id: data.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "DEVICE_REGISTER_FAILED" });
  }
});

app.post("/api/v1/calls/group", requireSupabase, requireUser, async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !livekitKey || !livekitSecret) return res.status(503).json({ error: "LIVEKIT_NOT_CONFIGURED" });
    const rawIds = req.body?.ttt_user_ids;
    if (!Array.isArray(rawIds) || rawIds.length < 2 || rawIds.length > 24 ||
        rawIds.some(id => !validTttUserId(id)) || new Set(rawIds).size !== rawIds.length) {
      return res.status(400).json({ error: "INVALID_GROUP_PARTICIPANTS", max_participants: 25 });
    }
    const callerProfile = await getProfile(supabaseAdmin, req.authUser.id);
    if (!callerProfile || callerProfile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    const targets = [];
    for (const id of rawIds) {
      const target = await resolveTttUserId(id);
      if (!target || target.status !== "ACTIVE") return res.status(404).json({ error: "GROUP_PARTICIPANT_NOT_FOUND" });
      if (target.id === req.authUser.id || targets.some(existing => existing.id === target.id)) {
        return res.status(400).json({ error: "INVALID_GROUP_PARTICIPANTS" });
      }
      targets.push(target);
    }
    const groupLimit = groupParticipantLimit(callerProfile, targets);
    if (targets.length + 1 > groupLimit) {
      return res.status(403).json({ error: "GROUP_PLAN_LIMIT_REACHED", plan: callerProfile.plan, max_participants: groupLimit });
    }
    const initialEntitlement = callEntitlement(callerProfile, [callerProfile]);
    const roomName = "ttt_group_" + randomUUID();
    const { data: call, error: callError } = await supabaseAdmin.from("calls")
      .insert({
        created_by: req.authUser.id, call_type: "GROUP", status: "RINGING",
        livekit_room_name: roomName, duration_limit_seconds: initialEntitlement.maxDurationSeconds,
        owner_override_active: initialEntitlement.ownerOverride, effective_plan: initialEntitlement.effectivePlan
      })
      .select("id,call_type,status,livekit_room_name,created_at,started_at").single();
    if (callError) throw callError;
    const now = new Date().toISOString();
    const participants = [
      { call_id: call.id, user_id: req.authUser.id, role: "CALLER", status: "ACCEPTED", joined_at: now },
      ...targets.map(target => ({ call_id: call.id, user_id: target.id, role: "PARTICIPANT", status: "RINGING" }))
    ];
    const { error: participantError } = await supabaseAdmin.from("call_participants").insert(participants);
    if (participantError) {
      await supabaseAdmin.from("calls").delete().eq("id", call.id);
      throw participantError;
    }
    const callerName = req.authUser.user_metadata?.display_name || "TingTring user";
    const { error: notificationError } = await supabaseAdmin.from("notifications").insert(
      targets.map(target => ({
        user_id: target.id, kind: "INCOMING_CALL", title: "Incoming TingTring group call",
        body: callerName, data: { call_id: call.id, call_type: "GROUP", room_name: roomName }
      }))
    );
    if (notificationError) throw notificationError;
    await sendCallPush(targets.map(target => target.id), "Incoming TingTring group call", callerName,
      { call_id: call.id, call_type: "GROUP", room_name: roomName });
    const token = new AccessToken(livekitKey, livekitSecret, { identity: req.authUser.id, ttl: "24h" });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    res.status(201).json({
      call_id: call.id, room_name: roomName, livekit_url: livekitUrl, token: await token.toJwt(),
      call_type: "GROUP", ...entitlementPayload(initialEntitlement, call)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "GROUP_CALL_START_FAILED" });
  }
});

app.post("/api/v1/calls/start", requireSupabase, requireUser, async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !livekitKey || !livekitSecret) return res.status(503).json({ error: "LIVEKIT_NOT_CONFIGURED" });
    const targetId = typeof req.body?.ttt_user_id === "string" ? req.body.ttt_user_id.trim() : "";
    const callType = req.body?.call_type === "VIDEO" ? "VIDEO" : "AUDIO";
    if (!validTttUserId(targetId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
    const target = await resolveTttUserId(targetId);
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.id === req.authUser.id) return res.status(400).json({ error: "CANNOT_CALL_SELF" });
    const callerProfile = await getProfile(supabaseAdmin, req.authUser.id);
    if (!callerProfile || callerProfile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    const initialEntitlement = callEntitlement(callerProfile, [callerProfile]);
    const roomName = "ttt_" + randomUUID();
    const { data: call, error: callError } = await supabaseAdmin.from("calls")
      .insert({
        created_by: req.authUser.id, call_type: callType, status: "RINGING",
        livekit_room_name: roomName, duration_limit_seconds: initialEntitlement.maxDurationSeconds,
        owner_override_active: initialEntitlement.ownerOverride, effective_plan: initialEntitlement.effectivePlan
      })
      .select("id,call_type,status,livekit_room_name,created_at,started_at").single();
    if (callError) throw callError;
    const { error: participantError } = await supabaseAdmin.from("call_participants").insert([
      { call_id: call.id, user_id: req.authUser.id, role: "CALLER", status: "ACCEPTED", joined_at: new Date().toISOString() },
      { call_id: call.id, user_id: target.id, role: "CALLEE", status: "RINGING" }
    ]);
    if (participantError) {
      await supabaseAdmin.from("calls").delete().eq("id", call.id);
      throw participantError;
    }
    const callerName = req.authUser.user_metadata?.display_name || "TingTring user";
    const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
      user_id: target.id,
      kind: "INCOMING_CALL",
      title: "Incoming TingTring call",
      body: callerName,
      data: { call_id: call.id, call_type: callType, room_name: roomName }
    });
    if (notificationError) throw notificationError;
    await sendCallPush([target.id], "Incoming TingTring call", callerName,
      { call_id: call.id, call_type: callType, room_name: roomName });
    const token = new AccessToken(livekitKey, livekitSecret, { identity: req.authUser.id, ttl: "24h" });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    res.status(201).json({
      call_id: call.id, room_name: roomName, livekit_url: livekitUrl, token: await token.toJwt(),
      call_type: callType, ...entitlementPayload(initialEntitlement, call)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CALL_START_FAILED" });
  }
});

app.post("/api/v1/calls/:callId/accept", requireSupabase, requireUser, async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !livekitKey || !livekitSecret) return res.status(503).json({ error: "LIVEKIT_NOT_CONFIGURED" });
    const { data: participant, error: lookupError } = await supabaseAdmin.from("call_participants")
      .select("call_id,role,status,call:call_id(id,created_by,call_type,status,livekit_room_name,started_at,duration_limit_seconds)")
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).in("role", ["CALLEE", "PARTICIPANT"]).maybeSingle();
    if (lookupError) throw lookupError;
    if (!participant?.call) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    if (!["RINGING", "ACCEPTED"].includes(participant.call.status)) return res.status(409).json({ error: "CALL_NOT_RINGING" });
    const callCreator = await getProfile(supabaseAdmin, participant.call.created_by);
    if (!callCreator) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    const acceptingProfile = await getProfile(supabaseAdmin, req.authUser.id);
    if (participant.call.call_type === "GROUP" && !isOverrideOwner(acceptingProfile)) {
      const { data: acceptedRows, error: acceptedError } = await supabaseAdmin.from("call_participants")
        .select("user_id,status,user:user_id(username,plan)")
        .eq("call_id", req.params.callId).eq("status", "ACCEPTED");
      if (acceptedError) throw acceptedError;
      const ownerAlreadyActive = (acceptedRows || []).some(row => isOverrideOwner(row.user));
      const currentLimit = groupParticipantLimit(callCreator, []);
      if (!ownerAlreadyActive && (acceptedRows || []).length >= currentLimit) {
        return res.status(403).json({ error: "GROUP_PLAN_LIMIT_REACHED", plan: callCreator.plan, max_participants: currentLimit });
      }
    }
    if (participant.call.status === "RINGING") {
      const { data: acceptedCall, error: callError } = await supabaseAdmin.from("calls")
        .update({ status: "ACCEPTED", connected_at: new Date().toISOString(), started_at: new Date().toISOString() })
        .eq("id", req.params.callId).eq("status", "RINGING")
        .select("id").maybeSingle();
      if (callError) throw callError;
      if (!acceptedCall) {
        const { data: latestCall, error: latestError } = await supabaseAdmin.from("calls")
          .select("status").eq("id", req.params.callId).maybeSingle();
        if (latestError) throw latestError;
        if (latestCall?.status !== "ACCEPTED") return res.status(409).json({ error: "CALL_NOT_RINGING" });
      }
    }
    const { error: participantError } = await supabaseAdmin.from("call_participants")
      .update({ status: "ACCEPTED", joined_at: new Date().toISOString() })
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).eq("status", "RINGING");
    if (participantError) throw participantError;
    const callContext = await loadCallEntitlement(req.params.callId, req.authUser.id);
    if (callContext.error) return res.status(404).json({ error: callContext.error });
    const token = new AccessToken(livekitKey, livekitSecret, { identity: req.authUser.id, ttl: "24h" });
    token.addGrant({ roomJoin: true, room: participant.call.livekit_room_name, canPublish: true, canSubscribe: true });
    res.status(200).json({
      call_id: participant.call.id, room_name: participant.call.livekit_room_name,
      livekit_url: livekitUrl, token: await token.toJwt(), call_type: participant.call.call_type,
      ...entitlementPayload(callContext.entitlement, callContext.call)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CALL_ACCEPT_FAILED" });
  }
});

app.get("/api/v1/calls/:callId/entitlements", requireSupabase, requireUser, async (req, res) => {
  try {
    const context = await loadCallEntitlement(req.params.callId, req.authUser.id);
    if (context.error) return res.status(404).json({ error: context.error });
    return res.status(200).json(entitlementPayload(context.entitlement, context.call));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "CALL_ENTITLEMENT_LOOKUP_FAILED" });
  }
});

app.get("/api/v1/calls/:callId/participants", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data: membership, error: membershipError } = await supabaseAdmin.from("call_participants")
      .select("call_id").eq("call_id", req.params.callId).eq("user_id", req.authUser.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    const { data, error } = await supabaseAdmin.from("call_participants")
      .select("user_id,role,status,joined_at,left_at,user:user_id(id,ttt_user_id,username,display_name,avatar_url)")
      .eq("call_id", req.params.callId).order("created_at", { ascending: true });
    if (error) throw error;
    return res.status(200).json({ participants: (data || []).map(p => ({
      user_id: p.user_id, role: p.role, status: p.status, joined_at: p.joined_at,
      left_at: p.left_at,
      user: p.user ? { id: p.user.id, ttt_user_id: p.user.ttt_user_id, username: p.user.username,
        display_name: p.user.display_name, avatar_url: p.user.avatar_url } : null
    })) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "CALL_PARTICIPANTS_LOOKUP_FAILED" });
  }
});

app.post("/api/v1/calls/:callId/leave", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data: participant, error: lookupError } = await supabaseAdmin.from("call_participants")
      .select("call_id,role,call:call_id(id,call_type,status,created_by)")
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!participant?.call) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    if (participant.call.call_type !== "GROUP") return res.status(400).json({ error: "LEAVE_ONLY_FOR_GROUP_CALLS" });
    if (participant.role === "CALLER") return res.status(403).json({ error: "CALLER_MUST_END_GROUP_CALL" });
    if (["ENDED", "DECLINED", "MISSED", "CANCELLED", "FAILED"].includes(participant.call.status)) {
      return res.status(409).json({ error: "CALL_ALREADY_ENDED" });
    }
    const { error: leaveError } = await supabaseAdmin.from("call_participants")
      .update({ status: "ENDED", left_at: new Date().toISOString() })
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).not("status", "in", '("ENDED","DECLINED","MISSED","CANCELLED","FAILED")');
    if (leaveError) throw leaveError;
    const { data: remaining, error: remainingError } = await supabaseAdmin.from("call_participants")
      .select("user_id,role,status").eq("call_id", req.params.callId);
    if (remainingError) throw remainingError;
    const activeInvitees = (remaining || []).filter(p => p.role !== "CALLER" && ["RINGING", "ACCEPTED"].includes(p.status));
    if (activeInvitees.length === 0) {
      const { error: endError } = await supabaseAdmin.from("calls")
        .update({ status: "ENDED", ended_at: new Date().toISOString() })
        .eq("id", req.params.callId).in("status", ["RINGING", "ACCEPTED"]);
      if (endError) throw endError;
      await supabaseAdmin.from("call_participants").update({ status: "ENDED", left_at: new Date().toISOString() })
        .eq("call_id", req.params.callId).eq("role", "CALLER").in("status", ["RINGING", "ACCEPTED"]);
    }
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "CALL_LEAVE_FAILED" });
  }
});

app.post("/api/v1/calls/:callId/decline", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data: participant, error: lookupError } = await supabaseAdmin.from("call_participants")
      .select("call_id,role,call:call_id(id,call_type,status)").eq("call_id", req.params.callId).eq("user_id", req.authUser.id).in("role", ["CALLEE", "PARTICIPANT"]).maybeSingle();
    if (lookupError) throw lookupError;
    if (!participant) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    if (participant.call?.call_type === "GROUP") {
      if (participant.call.status === "ENDED") return res.status(409).json({ error: "CALL_ALREADY_ENDED" });
      const { error: participantUpdateError } = await supabaseAdmin.from("call_participants").update({ status: "DECLINED", left_at: new Date().toISOString() })
        .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).eq("status", "RINGING");
      if (participantUpdateError) throw participantUpdateError;
      const { data: remaining, error: remainingError } = await supabaseAdmin.from("call_participants")
        .select("role,status").eq("call_id", req.params.callId);
      if (remainingError) throw remainingError;
      const activeInvitees = (remaining || []).filter(p => p.role !== "CALLER" && ["RINGING", "ACCEPTED"].includes(p.status));
      if (activeInvitees.length === 0) {
        const { error: endError } = await supabaseAdmin.from("calls").update({ status: "ENDED", ended_at: new Date().toISOString() })
          .eq("id", req.params.callId).in("status", ["RINGING", "ACCEPTED"]);
        if (endError) throw endError;
        await supabaseAdmin.from("call_participants").update({ status: "ENDED", left_at: new Date().toISOString() })
          .eq("call_id", req.params.callId).eq("role", "CALLER").in("status", ["RINGING", "ACCEPTED"]);
      }
      return res.status(204).send();
    }
    await supabaseAdmin.from("call_participants").update({ status: "DECLINED", left_at: new Date().toISOString() })
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).eq("status", "RINGING");
    const { error } = await supabaseAdmin.from("calls").update({ status: "DECLINED", ended_at: new Date().toISOString() })
      .eq("id", req.params.callId).eq("status", "RINGING");
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CALL_DECLINE_FAILED" });
  }
});

app.post("/api/v1/calls/:callId/end", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data: participant, error: participantError } = await supabaseAdmin.from("call_participants")
      .select("call_id,role,call:call_id(call_type,status)").eq("call_id", req.params.callId).eq("user_id", req.authUser.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    if (participant.call?.call_type === "GROUP" && participant.role !== "CALLER") return res.status(403).json({ error: "CALLER_ONLY_END_GROUP_CALL" });
    await supabaseAdmin.from("call_participants").update({ status: "ENDED", left_at: new Date().toISOString() })
      .eq("call_id", req.params.callId).in("status", ["RINGING", "ACCEPTED"]);
    const { error } = await supabaseAdmin.from("calls").update({ status: "ENDED", ended_at: new Date().toISOString(), ended_reason: "USER_ENDED" })
      .eq("id", req.params.callId).in("status", ["RINGING", "ACCEPTED"]);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CALL_END_FAILED" });
  }
});

app.get("/api/v1/directory/search", requireSupabase, requireUser, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    if (!validDirectoryQuery(q)) return res.status(400).json({ error: "INVALID_SEARCH" });
    const { data, error } = await supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,plan,avatar_url,status")
      .eq("status", "ACTIVE")
      .or("username.ilike."+q+"%,ttt_user_id.eq."+q)
      .order("username", { ascending: true }).limit(25);
    if (error) throw error;
    const results = [...(data || [])];
    const alias = await supabaseAdmin.from("identity_reservations").select("reserved_for_user_id").eq("ttt_user_id", q).maybeSingle();
    if (alias.error) throw alias.error;
    if (alias.data?.reserved_for_user_id && !results.some(p => p.id === alias.data.reserved_for_user_id)) {
      const current = await supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,plan,avatar_url,status").eq("id", alias.data.reserved_for_user_id).eq("status", "ACTIVE").maybeSingle();
      if (current.error) throw current.error;
      if (current.data) results.unshift(current.data);
    }
    res.status(200).json({ results: results.slice(0,25).map(p => ({ id:p.id, ttt_user_id:p.ttt_user_id, username:p.username, display_name:p.display_name, plan:p.plan, avatar_url:p.avatar_url, status:p.status })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "DIRECTORY_SEARCH_FAILED" });
  }
});

app.get("/api/v1/notifications/incoming-calls", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("notifications")
      .select("id,title,body,data,created_at")
      .eq("user_id", req.authUser.id)
      .eq("kind", "INCOMING_CALL")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    res.status(200).json({ notifications: data || [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "INCOMING_CALL_LOOKUP_FAILED" });
  }
});

app.post("/api/v1/notifications/:notificationId/read", requireSupabase, requireUser, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("id", req.params.notificationId).eq("user_id", req.authUser.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "NOTIFICATION_READ_FAILED" });
  }
});

app.get("/api/v1/contacts", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("contacts")
      .select("id,contact_user_id,is_blocked,created_at,contact:contact_user_id(id,ttt_user_id,username,display_name,plan,avatar_url,status,created_at,updated_at,last_seen_at)")
      .eq("owner_user_id", req.authUser.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.status(200).json({ contacts: (data || []).map(row => ({ id: row.id, is_blocked: row.is_blocked, created_at: row.created_at, user: row.contact })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CONTACTS_LOOKUP_FAILED" });
  }
});

app.post("/api/v1/contacts", requireSupabase, requireUser, async (req, res) => {
  try {
    const tttUserId = typeof req.body?.ttt_user_id === "string" ? req.body.ttt_user_id.trim().toLowerCase() : "";
    if (!validTttUserId(tttUserId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
    const contact = await resolveTttUserId(tttUserId);
    if (!contact) return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (contact.id === req.authUser.id) return res.status(400).json({ error: "CANNOT_ADD_SELF" });
    const { data, error } = await supabaseAdmin.from("contacts")
      .upsert({ owner_user_id: req.authUser.id, contact_user_id: contact.id, is_blocked: false }, { onConflict: "owner_user_id,contact_user_id" })
      .select("id,is_blocked,created_at").single();
    if (error) throw error;
    res.status(201).json({ contact: { ...data, user: publicProfile(contact) } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CONTACT_ADD_FAILED" });
  }
});

app.delete("/api/v1/contacts/:contactId", requireSupabase, requireUser, async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from("contacts").delete()
      .eq("id", req.params.contactId).eq("owner_user_id", req.authUser.id);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CONTACT_REMOVE_FAILED" });
  }
});

app.get("/api/v1/auth/me", requireSupabase, requireUser, async (req, res) => {
  try {
    const profile = await getProfile(supabaseAdmin, req.authUser.id);
    if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
    if (profile.status !== "ACTIVE") return res.status(403).json({ error: "ACCOUNT_UNAVAILABLE" });
    res.status(200).json({ user: publicProfile(profile) });
  } catch (error) { console.error(error); res.status(500).json({ error: "PROFILE_LOOKUP_FAILED" }); }
});

app.patch("/api/v1/profile", requireSupabase, requireUser, async (req, res) => {
  try {
    const { username, display_name, avatar_url } = req.body || {};
    const updates = {};
    if (username !== undefined) {
      if (!validateUsername(username)) return res.status(400).json({ error: "INVALID_USERNAME" });
      updates.username = username.trim().toLowerCase();
    }
    if (display_name !== undefined) {
      if (!validateDisplayName(display_name)) return res.status(400).json({ error: "INVALID_DISPLAY_NAME" });
      updates.display_name = display_name.trim();
    }
    if (avatar_url !== undefined) {
      if (avatar_url !== null && (typeof avatar_url !== "string" || avatar_url.length > 2048)) return res.status(400).json({ error: "INVALID_AVATAR_URL" });
      updates.avatar_url = avatar_url;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "NO_PROFILE_CHANGES" });
    const { data, error } = await supabaseAdmin.from("profiles").update(updates).eq("id", req.authUser.id)
      .select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url,created_at,updated_at,last_seen_at").single();
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "USERNAME_ALREADY_IN_USE" });
      throw error;
    }
    res.status(200).json({ user: publicProfile(data) });
  } catch (error) { console.error(error); res.status(500).json({ error: "PROFILE_UPDATE_FAILED" }); }
});

app.post("/api/v1/auth/password/reset-request", requireSupabase, async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    if (!validateEmail(normalizedEmail)) return res.status(400).json({ error: "INVALID_EMAIL" });
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail);
    if (error) return sendSupabaseError(res, error, "PASSWORD_RESET_FAILED");
    res.status(202).json({ status: "PASSWORD_RESET_REQUESTED" });
  } catch (error) { console.error(error); res.status(500).json({ error: "PASSWORD_RESET_FAILED" }); }
});

app.patch("/api/v1/auth/password", requireSupabase, requireUser, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "INVALID_PASSWORD" });
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.authUser.id, { password });
    if (error) return sendSupabaseError(res, error, "PASSWORD_UPDATE_FAILED");
    res.status(204).send();
  } catch (error) { console.error(error); res.status(500).json({ error: "PASSWORD_UPDATE_FAILED" }); }
});

app.delete("/api/v1/auth/account", requireSupabase, requireUser, async (req, res) => {
  try {
    const profile = await getProfile(supabaseAdmin, req.authUser.id);
    if (!profile) return res.status(404).json({ error: "PROFILE_NOT_FOUND" });
    const { error: reserveError } = await supabaseAdmin.from("identity_reservations").upsert({
      ttt_user_id: profile.ttt_user_id, reserved_for_user_id: null, reason: "ACCOUNT_DELETED"
    });
    if (reserveError) throw reserveError;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.authUser.id, false);
    if (error) return sendSupabaseError(res, error, "ACCOUNT_DELETE_FAILED");
    res.status(204).send();
  } catch (error) { console.error(error); res.status(500).json({ error: "ACCOUNT_DELETE_FAILED" }); }
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "REQUEST_BODY_TOO_LARGE" });
  }
  if (err?.type === "entity.parse.failed" || err?.status === 400) {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  console.error(err);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));

const callLimitSweep = setInterval(() => {
  enforceCallDurationLimits().catch(error => console.error("Call duration enforcement failed:", error?.message || error));
}, 10000);
callLimitSweep.unref();

app.listen(port, "0.0.0.0", () => console.log("TingTring Talk backend listening on port " + port));
