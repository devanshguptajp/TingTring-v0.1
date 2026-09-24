package com.tingtring.talk.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class TttUser(
    val id: String,
    val tttUserId: String,
    val username: String,
    val displayName: String,
    val plan: String,
    val avatarUrl: String?,
    val status: String
)
data class Contact(val id: String, val user: TttUser)
data class CallSession(val callId: String, val roomName: String, val livekitUrl: String, val token: String, val callType: String)
data class ApiResult<T>(val value: T? = null, val error: String? = null)

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("ttt_session", Context.MODE_PRIVATE)
    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(v) { prefs.edit().putString("access_token", v).apply() }
    var refreshToken: String?
        get() = prefs.getString("refresh_token", null)
        set(v) { prefs.edit().putString("refresh_token", v).apply() }
    fun clear() { prefs.edit().clear().apply() }
}

class ApiClient(private val baseUrl: String, private val session: SessionStore) {
    private suspend fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        auth: Boolean = false
    ): ApiResult<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 8000
                readTimeout = 10000
                setRequestProperty("Accept", "application/json")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
                if (auth) {
                    val token = session.accessToken
                    if (token == null) return@withContext ApiResult(error = "NOT_SIGNED_IN")
                    setRequestProperty("Authorization", "Bearer $token")
                }
            }
            body?.let { payload ->
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            connection.disconnect()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)
            if (status in 200..299) ApiResult(value = json)
            else ApiResult(error = json.optString("error", "REQUEST_FAILED"))
        } catch (e: Exception) {
            ApiResult(error = e.message ?: "NETWORK_ERROR")
        }
    }

    private fun user(j: JSONObject) = TttUser(
        id = j.optString("id"),
        tttUserId = j.optString("ttt_user_id"),
        username = j.optString("username"),
        displayName = j.optString("display_name"),
        plan = j.optString("plan", "FREE"),
        avatarUrl = j.optString("avatar_url").takeIf { it.isNotBlank() },
        status = j.optString("status", "ACTIVE")
    )

    suspend fun passwordLogin(email: String, password: String): ApiResult<TttUser> {
        val r = request("POST", "/api/v1/auth/login/password", JSONObject().apply {
            put("email", email); put("password", password)
        })
        if (r.value == null) return ApiResult(error = r.error)
        save(r.value)
        return ApiResult(value = user(r.value.getJSONObject("user")))
    }

    suspend fun signup(email: String, password: String, username: String, displayName: String): ApiResult<TttUser> {
        val r = request("POST", "/api/v1/auth/signup", JSONObject().apply {
            put("email", email); put("password", password); put("username", username); put("display_name", displayName)
        })
        if (r.value == null) return ApiResult(error = r.error)
        save(r.value)
        val u = r.value.optJSONObject("user")
            ?: return ApiResult(error = r.value.optString("status", "EMAIL_VERIFICATION_REQUIRED"))
        return ApiResult(value = user(u))
    }

    suspend fun startOtp(email: String): ApiResult<Unit> {
        val r = request("POST", "/api/v1/auth/otp/start", JSONObject().apply {
            put("email", email); put("should_create_user", false)
        })
        return if (r.value != null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun verifyOtp(email: String, token: String): ApiResult<TttUser> {
        val r = request("POST", "/api/v1/auth/otp/verify", JSONObject().apply {
            put("email", email); put("token", token)
        })
        if (r.value == null) return ApiResult(error = r.error)
        save(r.value)
        val u = r.value.optJSONObject("user")
            ?: return ApiResult(error = r.value.optString("error", "PROFILE_SETUP_REQUIRED"))
        return ApiResult(value = user(u))
    }

    suspend fun refreshSession(): ApiResult<TttUser> {
        val refresh = session.refreshToken ?: return ApiResult(error = "NO_REFRESH_TOKEN")
        val r = request("POST", "/api/v1/auth/refresh", JSONObject().apply { put("refresh_token", refresh) })
        if (r.value == null) {
            session.clear()
            return ApiResult(error = r.error)
        }
        save(r.value)
        val u = r.value.optJSONObject("user") ?: return ApiResult(error = "INVALID_SESSION")
        return ApiResult(value = user(u))
    }

    suspend fun me(): ApiResult<TttUser> {
        val r = request("GET", "/api/v1/auth/me", auth = true)
        return if (r.value != null) ApiResult(value = user(r.value.getJSONObject("user")))
        else ApiResult(error = r.error)
    }

    suspend fun resetPassword(email: String): ApiResult<Unit> {
        val r = request("POST", "/api/v1/auth/password/reset-request", JSONObject().apply { put("email", email) })
        return if (r.value != null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun logout(): ApiResult<Unit> {
        val r = request("POST", "/api/v1/auth/logout", auth = true)
        session.clear()
        return if (r.error == null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun updateProfile(username: String, displayName: String): ApiResult<TttUser> {
        val r = request("PATCH", "/api/v1/profile", JSONObject().apply {
            put("username", username); put("display_name", displayName)
        }, auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        return ApiResult(value = user(r.value.getJSONObject("user")))
    }

    suspend fun search(q: String): ApiResult<List<TttUser>> {
        val r = request("GET", "/api/v1/directory/search?q=" + URLEncoder.encode(q, "UTF-8"), auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        val a = r.value.optJSONArray("results") ?: JSONArray()
        return ApiResult(value = (0 until a.length()).map { user(a.getJSONObject(it)) })
    }

    suspend fun startCall(tttUserId: String, video: Boolean = false): ApiResult<CallSession> {
        val r = request("POST", "/api/v1/calls/start", JSONObject().apply {
            put("ttt_user_id", tttUserId); put("call_type", if (video) "VIDEO" else "AUDIO")
        }, auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        return ApiResult(value = CallSession(
            r.value.optString("call_id"), r.value.optString("room_name"),
            r.value.optString("livekit_url"), r.value.optString("token"),
            r.value.optString("call_type", "AUDIO")
        ))
    }

    suspend fun endCall(callId: String): ApiResult<Unit> {
        val r = request("POST", "/api/v1/calls/$callId/end", auth = true)
        return if (r.error == null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun contacts(): ApiResult<List<Contact>> {
        val r = request("GET", "/api/v1/contacts", auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        val a = r.value.optJSONArray("contacts") ?: JSONArray()
        return ApiResult(value = (0 until a.length()).map {
            val o = a.getJSONObject(it)
            Contact(o.optString("id"), user(o.getJSONObject("user")))
        })
    }

    suspend fun addContact(id: String): ApiResult<Unit> {
        val r = request("POST", "/api/v1/contacts", JSONObject().apply { put("ttt_user_id", id) }, auth = true)
        return if (r.value != null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun removeContact(id: String): ApiResult<Unit> {
        val r = request("DELETE", "/api/v1/contacts/$id", auth = true)
        return if (r.error == null) ApiResult(Unit) else ApiResult(error = r.error)
    }

    suspend fun ownerSearchUsers(q: String): ApiResult<List<TttUser>> {
        val r = request("GET", "/api/v1/owner/users/search?q=" + URLEncoder.encode(q, "UTF-8"), auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        val a = r.value.optJSONArray("results") ?: JSONArray()
        return ApiResult(value = (0 until a.length()).map { user(a.getJSONObject(it)) })
    }

    suspend fun ownerChangeTttId(userId: String, newId: String): ApiResult<Pair<String, String>> {
        val r = request("POST", "/api/v1/owner/users/$userId/ttt-id", JSONObject().apply {
            put("ttt_user_id", newId)
        }, auth = true)
        if (r.value == null) return ApiResult(error = r.error)
        return ApiResult(r.value.optString("old_ttt_user_id") to r.value.optString("ttt_user_id"))
    }

    private fun save(j: JSONObject) {
        j.optString("access_token").ifBlank { null }?.let { session.accessToken = it }
        j.optString("refresh_token").ifBlank { null }?.let { session.refreshToken = it }
    }
}
