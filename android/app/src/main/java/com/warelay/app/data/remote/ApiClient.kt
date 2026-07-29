package com.warelay.app.data.remote

import com.warelay.app.data.model.MatchedMessage
import com.warelay.app.data.prefs.UserPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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

    suspend fun fetchMessages(token: String): List<MatchedMessage> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(preferences.getHostUrl() + "/messages?limit=100")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (res.code == 401) throw UnauthorizedException()
            if (!res.isSuccessful) throw ApiException("HTTP ${res.code}")
            val arr = JSONObject(text).getJSONArray("messages")
            parseMessages(arr)
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
                senderPhone = obj.optString("senderPhone").ifBlank { null },
                senderName = obj.optString("senderName").ifBlank { null },
                chatId = obj.optString("chatId"),
                isGroup = obj.optBoolean("isGroup"),
                waLink = obj.optString("waLink").ifBlank { null },
                matchedPattern = obj.optString("matchedPattern").ifBlank { null },
                timestamp = obj.optString("timestamp").ifBlank { null },
            )
    }
}

class ApiException(message: String) : Exception(message)
class UnauthorizedException : Exception("Unauthorized")
