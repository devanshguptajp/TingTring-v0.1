import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
    const { email, password, username, display_name } = req.body || {};
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
    const { username, display_name } = req.body || {};
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

app.get("/api/v1/directory/search", requireSupabase, requireUser, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3 || q.length > 30) return res.status(400).json({ error: "INVALID_SEARCH" });
    const normalized = q.toLowerCase();
    const pattern = normalized.replace(/[%_,]/g, "");
    const { data, error } = await supabaseAdmin.from("profiles")
      .select("id,ttt_user_id,username,display_name,plan,avatar_url,status")
      .eq("status", "ACTIVE")
      .or("username.ilike."+pattern+"%,ttt_user_id.eq."+pattern)
      .order("username", { ascending: true })
      .limit(25);
    if (error) throw error;
    res.status(200).json({ results: (data || []).map(p => ({
      id:p.id, ttt_user_id:p.ttt_user_id, username:p.username, display_name:p.display_name,
      plan:p.plan, avatar_url:p.avatar_url, status:p.status
    })) });
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
    if (!/^\\d{10}$/.test(tttUserId)) return res.status(400).json({ error: "INVALID_TTT_USER_ID" });
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
      updates.username = username;
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
