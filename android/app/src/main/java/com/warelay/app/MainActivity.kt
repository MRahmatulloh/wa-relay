package com.warelay.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import android.os.Handler
import android.os.Looper
import com.warelay.app.fcm.NotificationHelper
import com.warelay.app.ui.RelayViewModel
import com.warelay.app.ui.theme.WaRelayTheme
import com.warelay.app.ui.AppNav

class MainActivity : ComponentActivity() {
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        requestNotifPermission()

        val app = application as WaRelayApp
        setContent {
            WaRelayTheme {
                val vm: RelayViewModel = viewModel(factory = RelayViewModel.Factory(app.container))
                val state by vm.state.collectAsState()
                AppNav(
                    state = state,
                    onSaveHost = vm::saveHost,
                    onLogin = vm::login,
                    onLogout = vm::logout,
                    onRefresh = vm::refresh,
                    onLoadMore = vm::loadMore,
                    onClearFlash = vm::clearMessages,
                    onOpenWhatsApp = { link ->
                        if (!link.isNullOrBlank()) {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)))
                        }
                    },
                    onSearchChange = vm::setSearchQuery,
                    onFilterChange = vm::setFilter,
                    onFolderChange = vm::setFolder,
                    onToggleExpanded = vm::toggleExpanded,
                    onToggleStar = vm::toggleStar,
                    onToggleDone = vm::toggleDone,
                    onTestLocalNotification = {
                        Handler(Looper.getMainLooper()).postDelayed({
                            NotificationHelper.show(
                                this,
                                "Local test",
                                "If you see this on Home, notifications work. FCM/MuMu may still block remote push.",
                            )
                        }, 5000L)
                    },
                )
            }
        }
    }

    private fun requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
