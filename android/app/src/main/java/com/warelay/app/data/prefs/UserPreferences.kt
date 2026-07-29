package com.warelay.app.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("wa_relay_prefs")

class UserPreferences(private val context: Context) {
    private val hostKey = stringPreferencesKey("host_url")
    private val tokenKey = stringPreferencesKey("auth_token")
    private val usernameKey = stringPreferencesKey("username")

    val hostUrl: Flow<String> = context.dataStore.data.map { it[hostKey] ?: "http://10.0.2.2:3000" }
    val token: Flow<String?> = context.dataStore.data.map { it[tokenKey] }
    val username: Flow<String?> = context.dataStore.data.map { it[usernameKey] }

    suspend fun getHostUrl(): String = hostUrl.first()
    suspend fun getToken(): String? = token.first()

    suspend fun setHostUrl(url: String) {
        context.dataStore.edit { it[hostKey] = url.trim().trimEnd('/') }
    }

    suspend fun setSession(token: String, username: String) {
        context.dataStore.edit {
            it[tokenKey] = token
            it[usernameKey] = username
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit {
            it.remove(tokenKey)
            it.remove(usernameKey)
        }
    }
}
