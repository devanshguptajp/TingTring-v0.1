import { createClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const DISPLAY_NAME_MAX = 80;

export function validateEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim().toLowerCase());
}
export function normalizeEmail(email) { return email.trim().toLowerCase(); }
export function validateUsername(username) {
  return typeof username === "string" && USERNAME_RE.test(username);
}
export function validateDisplayName(displayName) {
  return typeof displayName === "string" && displayName.trim().length >= 1 && displayName.trim().length <= DISPLAY_NAME_MAX;
}
export function createAuthClient(url, key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
export async function getAuthenticatedUser(supabaseAdmin, authorizationHeader) {
  if (typeof authorizationHeader !== "string" || !authorizationHeader.startsWith("Bearer ")) return { user: null, error: "MISSING_AUTHORIZATION" };
  const token = authorizationHeader.slice(7).trim();
  if (!token) return { user: null, error: "MISSING_AUTHORIZATION" };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "INVALID_SESSION" };
  return { user: data.user, token };
}
export async function getProfile(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin.from("profiles")
    .select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url,created_at,updated_at,last_seen_at")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function ensureProfile(supabaseAdmin, user, supplied = {}) {
  const existing = await getProfile(supabaseAdmin, user.id);
  if (existing) return existing;
  const metadata = user.user_metadata || {};
  const username = supplied.username || metadata.username;
  const displayName = supplied.display_name || metadata.display_name || username;
  if (!validateUsername(username) || !validateDisplayName(displayName)) {
    const error = new Error("PROFILE_SETUP_REQUIRED");
    error.code = "PROFILE_SETUP_REQUIRED";
    throw error;
  }
  const { data, error } = await supabaseAdmin.from("profiles").insert({
    id: user.id, username, display_name: displayName.trim(), email: user.email || null
  }).select("id,ttt_user_id,username,display_name,email,status,plan,avatar_url,created_at,updated_at,last_seen_at").single();
  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("USERNAME_ALREADY_IN_USE");
      conflict.code = "USERNAME_ALREADY_IN_USE";
      throw conflict;
    }
    throw error;
  }
  return data;
}
export function publicProfile(profile) {
  return {
    id: profile.id, ttt_user_id: profile.ttt_user_id, username: profile.username,
    display_name: profile.display_name, plan: profile.plan, avatar_url: profile.avatar_url,
    status: profile.status, created_at: profile.created_at, updated_at: profile.updated_at,
    last_seen_at: profile.last_seen_at
  };
}
export function authResponse(session, profile) {
  return {
    access_token: session?.access_token || null, refresh_token: session?.refresh_token || null,
    expires_in: session?.expires_in || null, expires_at: session?.expires_at || null,
    user: profile ? publicProfile(profile) : null
  };
}
