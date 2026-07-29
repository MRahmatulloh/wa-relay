package com.warelay.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.warelay.app.data.model.MatchedMessage

@Composable
fun AppNav(
    state: UiState,
    onSaveHost: (String) -> Unit,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onClearFlash: () -> Unit,
    onOpenWhatsApp: (String?) -> Unit,
) {
    val nav = rememberNavController()
    val start = if (state.token.isNullOrBlank()) "login" else "messages"

    LaunchedEffect(state.token) {
        val target = if (state.token.isNullOrBlank()) "login" else "messages"
        if (nav.currentDestination?.route != target && nav.currentDestination?.route != "settings") {
            nav.navigate(target) {
                popUpTo(0) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    NavHost(navController = nav, startDestination = start) {
        composable("login") {
            AuthScreen(
                state = state,
                onLogin = onLogin,
                onRegister = onRegister,
                onOpenSettings = { nav.navigate("settings") },
                onClearFlash = onClearFlash,
            )
        }
        composable("settings") {
            SettingsScreen(
                hostUrl = state.hostUrl,
                onSave = {
                    onSaveHost(it)
                    nav.popBackStack()
                },
                onBack = { nav.popBackStack() },
            )
        }
        composable("messages") {
            MessagesScreen(
                state = state,
                onRefresh = onRefresh,
                onLogout = onLogout,
                onOpenSettings = { nav.navigate("settings") },
                onOpenWhatsApp = onOpenWhatsApp,
                onClearFlash = onClearFlash,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    hostUrl: String,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
) {
    var value by remember(hostUrl) { mutableStateOf(hostUrl) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Host settings") },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("Back") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Backend base URL (no trailing slash needed)")
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("http://192.168.1.10:3000") },
            )
            Text(
                "Emulator: http://10.0.2.2:3000\nDevice: http://<PC-LAN-IP>:3000",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = { onSave(value) }, modifier = Modifier.fillMaxWidth()) {
                Text("Save")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(
    state: UiState,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String) -> Unit,
    onOpenSettings: () -> Unit,
    onClearFlash: () -> Unit,
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("WA Relay") },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Host: ${state.hostUrl}", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
            )
            if (state.loading) {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                LaunchedEffect(it) { onClearFlash() }
            }
            state.info?.let {
                Text(it, color = MaterialTheme.colorScheme.primary)
            }
            Button(
                onClick = { onLogin(username.trim(), password) },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Login") }
            OutlinedButton(
                onClick = { onRegister(username.trim(), password) },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Register") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(
    state: UiState,
    onRefresh: () -> Unit,
    onLogout: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenWhatsApp: (String?) -> Unit,
    onClearFlash: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.username ?: "Messages") },
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            state.error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                LaunchedEffect(it) { onClearFlash() }
            }
            if (state.loading && state.messages.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(state.messages, key = { it.messageId.ifBlank { it.id } }) { msg ->
                    MessageCard(msg, onOpenWhatsApp)
                }
            }
        }
    }
}

@Composable
fun MessageCard(msg: MatchedMessage, onOpenWhatsApp: (String?) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Text(
            text = msg.senderName ?: msg.senderPhone ?: "Unknown sender",
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 14.dp),
        )
        Text(
            text = msg.text,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
        )
        if (!msg.matchedPattern.isNullOrBlank()) {
            Text(
                text = "Pattern: ${msg.matchedPattern}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 14.dp),
            )
        }
        val enabled = !msg.waLink.isNullOrBlank()
        Button(
            onClick = { onOpenWhatsApp(msg.waLink) },
            enabled = enabled,
            modifier = Modifier.padding(14.dp),
        ) {
            Text(if (enabled) "Open in WhatsApp" else "No phone")
        }
    }
}
