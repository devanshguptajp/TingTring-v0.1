import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AccessToken } from "livekit-server-sdk";
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

async function requireOwner(req, res, next) {\n  const profile = await getProfile(supabaseAdmin, req.authUser.id);\n  if (!profile || profile.plan !== "OWNER") return res.status(403).json({ error: "OWNER_ONLY" });\n  req.ownerProfile = profile;\n  next();\n}\n\nfunction validTttUserId(value) { return typeof value === "string" && /^[a-z0-9_]{3,30}$/.test(value); }\n\nasync function resolveTttUserId(value) {\n  const normalized = value.trim().toLowerCase();\n  const direct = await supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,status,plan,avatar_url").eq("ttt_user_id", normalized).eq("status", "ACTIVE").maybeSingle();\n  if (direct.error) throw direct.error;\n  if (direct.data) return direct.data;\n  const alias = await supabaseAdmin.from("identity_reservations").select("reserved_for_user_id").eq("ttt_user_id", normalized).maybeSingle();\n  if (alias.error) throw alias.error;\n  if (!alias.data?.reserved_for_user_id) return null;\n  const current = await supabaseAdmin.from("profiles").select("id,ttt_user_id,username,display_name,status,plan,avatar_url").eq("id", alias.data.reserved_for_user_id).eq("status", "ACTIVE").maybeSingle();\n  if (current.error) throw current.error;\n  return current.data || null;\n}\n\nfunction requireSupabase(req, res, next) {
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
  next();
}

app.get("/health", (_req, res) => res.status(200).json({
  service: "tingtring-talk-backend", status: "ok", version: "0.1.0",
  environment: process.env.NODE_ENV || "development", supabaseConfigured
}));
app.get("/api/v1", (_req, res) => res.status(200).json({ name: "TingTring Talk API", version: "v1", status: "online" }));
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

app.get("/api/v1/owner/users/search", requireSupabase, requireUser, requireOwner, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    if (q.length < 3) return res.status(400).json({ error: "INVALID_QUERY" });
    const isId = /^[a-z0-9_]{3,30}$/.test(q);
    const isEmail = q.includes("@") && q.length <= 320;
    let query = supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url")
      .limit(20);
    if (isEmail) query = query.ilike("email", q);
    else if (isId) query = query.or("ttt_user_id.eq."+q+",username.ilike."+q+"%");
    else query = query.or("username.ilike."+q+"%,display_name.ilike."+q+"%");
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "OWNER_SEARCH_FAILED" });
    return res.status(200).json({ results: data || [] });
  } catch {
    return res.status(500).json({ error: "OWNER_SEARCH_FAILED" });
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

app.post("/api/v1/calls/start", requireSupabase, requireUser, async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitKey = process.env.LIVEKIT_API_KEY;
    const livekitSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !livekitKey || !livekitSecret) return res.status(503).json({ error: "LIVEKIT_NOT_CONFIGURED" });
    const targetId = typeof req.body?.ttt_user_id === "string" ? req.body.ttt_user_id.trim() : "";
    const callType = req.body?.call_type === "VIDEO" ? "VIDEO" : "AUDIO";
    if (!validTttUserId(targetId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
    const { data: target, error: targetError } = await supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,status").eq("ttt_user_id", targetId).eq("status", "ACTIVE").maybeSingle();
    if (targetError) throw targetError;
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (target.id === req.authUser.id) return res.status(400).json({ error: "CANNOT_CALL_SELF" });
    const roomName = "ttt_" + randomUUID();
    const { data: call, error: callError } = await supabaseAdmin.from("calls")
      .insert({ created_by: req.authUser.id, call_type: callType, status: "RINGING", livekit_room_name: roomName })
      .select("id,call_type,status,livekit_room_name,created_at").single();
    if (callError) throw callError;
    const { error: participantError } = await supabaseAdmin.from("call_participants").insert([
      { call_id: call.id, user_id: req.authUser.id, role: "CALLER", status: "RINGING" },
      { call_id: call.id, user_id: target.id, role: "CALLEE", status: "RINGING" }
    ]);
    if (participantError) {
      await supabaseAdmin.from("calls").delete().eq("id", call.id);
      throw participantError;
    }
    await supabaseAdmin.from("notifications").insert({
      user_id: target.id,
      kind: "INCOMING_CALL",
      title: "Incoming TingTring call",
      body: req.authUser.user_metadata?.display_name || "TingTring user",
      data: { call_id: call.id, call_type: callType, room_name: roomName }
    });
    const token = new AccessToken(livekitKey, livekitSecret, { identity: req.authUser.id, ttl: "10m" });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    res.status(201).json({ call_id: call.id, room_name: roomName, livekit_url: livekitUrl, token: await token.toJwt(), call_type: callType });
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
      .select("call_id,call:call_id(id,created_by,call_type,status,livekit_room_name)")
      .eq("call_id", req.params.callId).eq("user_id", req.authUser.id).eq("role", "CALLEE").maybeSingle();
    if (lookupError) throw lookupError;
    if (!participant?.call) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    if (participant.call.status !== "RINGING") return res.status(409).json({ error: "CALL_NOT_RINGING" });
    const { error: callError } = await supabaseAdmin.from("calls").update({ status: "ACCEPTED", connected_at: new Date().toISOString(), started_at: new Date().toISOString() }).eq("id", req.params.callId).eq("status", "RINGING");
    if (callError) throw callError;
    const { error: participantError } = await supabaseAdmin.from("call_participants").update({ status: "ACCEPTED", joined_at: new Date().toISOString() }).eq("call_id", req.params.callId).eq("user_id", req.authUser.id);
    if (participantError) throw participantError;
    const token = new AccessToken(livekitKey, livekitSecret, { identity: req.authUser.id, ttl: "10m" });
    token.addGrant({ roomJoin: true, room: participant.call.livekit_room_name, canPublish: true, canSubscribe: true });
    res.status(200).json({ call_id: participant.call.id, room_name: participant.call.livekit_room_name, livekit_url: livekitUrl, token: await token.toJwt(), call_type: participant.call.call_type });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "CALL_ACCEPT_FAILED" });
  }
});

app.post("/api/v1/calls/:callId/decline", requireSupabase, requireUser, async (req, res) => {
  try {
    const { data: participant, error: lookupError } = await supabaseAdmin.from("call_participants")
      .select("call_id").eq("call_id", req.params.callId).eq("user_id", req.authUser.id).eq("role", "CALLEE").maybeSingle();
    if (lookupError) throw lookupError;
    if (!participant) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    await supabaseAdmin.from("call_participants").update({ status: "DECLINED", left_at: new Date().toISOString() }).eq("call_id", req.params.callId).eq("user_id", req.authUser.id);
    const { error } = await supabaseAdmin.from("calls").update({ status: "DECLINED", ended_at: new Date().toISOString() }).eq("id", req.params.callId);
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
      .select("call_id").eq("call_id", req.params.callId).eq("user_id", req.authUser.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return res.status(404).json({ error: "CALL_NOT_FOUND" });
    const { error } = await supabaseAdmin.from("calls").update({ status: "ENDED", ended_at: new Date().toISOString() }).eq("id", req.params.callId);
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
    if (!validTttUserId(q)) return res.status(400).json({ error: "INVALID_SEARCH" });
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
    const tttUserId = typeof req.body?.ttt_user_id === "string" ? req.body.ttt_user_id.trim() : "";
    if (!/^\d{10}$/.test(tttUserId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
    const { data: contact, error: lookupError } = await supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,plan,avatar_url,status,created_at,updated_at,last_seen_at")
      .eq("ttt_user_id", tttUserId).eq("status", "ACTIVE").maybeSingle();
    if (lookupError) throw lookupError;
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

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); });
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
app.listen(port, "0.0.0.0", () => console.log("TingTring Talk backend listening on port " + port));
