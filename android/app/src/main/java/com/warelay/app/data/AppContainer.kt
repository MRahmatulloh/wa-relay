package com.warelay.app.data

import android.content.Context
import com.warelay.app.data.prefs.UserPreferences
import com.warelay.app.data.remote.ApiClient
import com.warelay.app.data.remote.SocketManager

class AppContainer(context: Context) {
    val preferences = UserPreferences(context)
    val api = ApiClient(preferences)
    val socketManager = SocketManager(preferences)
}
