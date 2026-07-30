package com.warelay.app

import android.app.Application
import com.warelay.app.data.AppContainer
import com.warelay.app.fcm.RelayFirebaseMessagingService

class WaRelayApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        RelayFirebaseMessagingService.ensureChannel(this)
    }
}
