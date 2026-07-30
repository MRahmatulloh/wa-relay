package com.warelay.app.data.remote

import com.warelay.app.data.model.MatchedMessage
import com.warelay.app.data.prefs.UserPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiClient(private val preferences: UserPreferences) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    data class AuthResult(val token: String, val username: String)

    data class MessagesPage(
        val messages: List<MatchedMessage>,
        val hasMore: Boolean,
        val nextCursor: String?,
    )

    data class MessageQuery(
        val q: String? = null,
        val unread: Boolean? = null,
        val starred: Boolean? = null,
        val done: Boolean? = null,
        val isGroup: Boolean? = null,
        val folder: String? = null,
        val limit: Int = 40,
        /** Last message id from previous page (exclusive). */
        val before: String? = null,
    )

    suspend fun register(username: String, password: String): AuthResult =
        auth("/auth/register", username, password)

    suspend fun login(username: String, password: String): AuthResult =
        auth("/auth/login", username, password)

    private suspend fun auth(path: String, username: String, password: String): AuthResult =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("username", username)
                .put("password", password)
                .toString()
                .toRequestBody(jsonMedia)
            val req = Request.Builder()
                .url(preferences.getHostUrl() + path)
                .post(body)
                .build()
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                    throw ApiException(err?.ifBlank { null } ?: "HTTP ${res.code}")
                }
                val json = JSONObject(text)
                AuthResult(
                    token = json.getString("token"),
                    username = json.getJSONObject("user").getString("username"),
                )
            }
        }

    suspend fun fetchMessages(token: String, query: MessageQuery = MessageQuery()): MessagesPage =
        withContext(Dispatchers.IO) {
            val base = preferences.getHostUrl().trimEnd('/')
            val urlBuilder = "$base/messages".toHttpUrl().newBuilder()
                .addQueryParameter("limit", query.limit.toString())
            if (!query.q.isNullOrBlank()) urlBuilder.addQueryParameter("q", query.q)
            query.unread?.let { urlBuilder.addQueryParameter("unread", it.toString()) }
            query.starred?.let { urlBuilder.addQueryParameter("starred", it.toString()) }
            query.done?.let { urlBuilder.addQueryParameter("done", it.toString()) }
            query.isGroup?.let { urlBuilder.addQueryParameter("isGroup", it.toString()) }
            if (!query.folder.isNullOrBlank() && query.folder != "all") {
                urlBuilder.addQueryParameter("folder", query.folder)
            }
            if (!query.before.isNullOrBlank()) {
                urlBuilder.addQueryParameter("before", query.before)
            }

            val req = Request.Builder()
                .url(urlBuilder.build())
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (res.code == 401) throw UnauthorizedException()
                if (!res.isSuccessful) throw ApiException("HTTP ${res.code}")
                val json = JSONObject(text)
                val arr = json.getJSONArray("messages")
                MessagesPage(
                    messages = parseMessages(arr),
                    hasMore = json.optBoolean("hasMore", false),
                    nextCursor = json.optString("nextCursor").ifBlank { null },
                )
            }
        }

    suspend fun fetchUnreadCounts(token: String): Map<String, Int> =
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(preferences.getHostUrl().trimEnd('/') + "/messages/unread-counts")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (res.code == 401) throw UnauthorizedException()
                if (!res.isSuccessful) throw ApiException("HTTP ${res.code}")
                val obj = JSONObject(text).getJSONObject("counts")
                val keys = listOf("all", "lgw", "lhr", "ltn", "stn", "others")
                keys.associateWith { obj.optInt(it, 0) }
            }
        }

    suspend fun patchMessage(
        token: String,
        id: String,
        read: Boolean? = null,
        starred: Boolean? = null,
        done: Boolean? = null,
    ): MatchedMessage = withContext(Dispatchers.IO) {
        val bodyJson = JSONObject()
        if (read != null) bodyJson.put("read", read)
        if (starred != null) bodyJson.put("starred", starred)
        if (done != null) bodyJson.put("done", done)
        val body = bodyJson.toString().toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(preferences.getHostUrl().trimEnd('/') + "/messages/$id")
            .header("Authorization", "Bearer $token")
            .patch(body)
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (res.code == 401) throw UnauthorizedException()
            if (!res.isSuccessful) {
                val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                throw ApiException(err?.ifBlank { null } ?: "HTTP ${res.code}")
            }
            parseMessage(JSONObject(text).getJSONObject("message"))
        }
    }

    suspend fun registerDevice(token: String, fcmToken: String) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("fcmToken", fcmToken)
            .put("platform", "android")
            .toString()
            .toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(preferences.getHostUrl() + "/devices/register")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            if (res.code == 401) throw UnauthorizedException()
            if (!res.isSuccessful) {
                val text = res.body?.string().orEmpty()
                throw ApiException(text.ifBlank { "HTTP ${res.code}" })
            }
        }
    }

    companion object {
        fun parseMessages(arr: JSONArray): List<MatchedMessage> {
            val list = mutableListOf<MatchedMessage>()
            for (i in 0 until arr.length()) {
                list += parseMessage(arr.getJSONObject(i))
            }
            return list
        }

        fun parseMessage(obj: JSONObject): MatchedMessage =
            MatchedMessage(
                id = obj.optString("id"),
                messageId = obj.optString("messageId"),
                text = obj.optString("text"),
                senderPhone = optNullableString(obj, "senderPhone"),
                senderName = optNullableString(obj, "senderName"),
                chatId = obj.optString("chatId"),
                isGroup = obj.optBoolean("isGroup"),
                waLink = optNullableString(obj, "waLink"),
                matchedPattern = optNullableString(obj, "matchedPattern"),
                folder = optNullableString(obj, "folder"),
                timestamp = optNullableString(obj, "timestamp"),
                createdAt = optNullableString(obj, "createdAt"),
                readAt = optNullableString(obj, "readAt"),
                starred = obj.optBoolean("starred", false),
                done = obj.optBoolean("done", false),
            )

        /**
         * JSONObject.optString returns the literal "null" for JSON null — treat that as absent.
         */
        private fun optNullableString(obj: JSONObject, key: String): String? {
            if (!obj.has(key) || obj.isNull(key)) return null
            val value = obj.optString(key).trim()
            if (value.isEmpty() || value == "null" || value == "undefined") return null
            return value
        }
    }
}

class ApiException(message: String) : Exception(message)
class UnauthorizedException : Exception("Unauthorized")
