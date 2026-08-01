package com.warelay.app.ui

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import android.widget.Toast
import com.warelay.app.R
import com.warelay.app.data.model.MatchedMessage
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun AppNav(
    state: UiState,
    onSaveHost: (String) -> Unit,
    onLogin: (String, String) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onClearFlash: () -> Unit,
    onOpenWhatsApp: (String?) -> Unit,
    onSearchChange: (String) -> Unit,
    onFilterChange: (InboxFilter) -> Unit,
    onFolderChange: (InboxFolder) -> Unit,
    onToggleExpanded: (MatchedMessage) -> Unit,
    onToggleStar: (MatchedMessage) -> Unit,
    onToggleThumbsUp: (MatchedMessage) -> Unit,
    onToggleDone: (MatchedMessage) -> Unit,
    onMarkAllSeen: () -> Unit,
    onTestLocalNotification: () -> Unit,
    onStartSessionPolling: () -> Unit,
    onStopSessionPolling: () -> Unit,
    onRefreshSession: () -> Unit,
) {
    if (!state.sessionReady) {
        SplashScreen()
        return
    }

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
                onOpenSettings = { nav.navigate("settings") },
                onClearFlash = onClearFlash,
            )
        }
        composable("settings") {
            SettingsScreen(
                hostUrl = state.hostUrl,
                username = state.username,
                whatsappSession = state.whatsappSession,
                onSave = {
                    onSaveHost(it)
                    nav.popBackStack()
                },
                onBack = { nav.popBackStack() },
                onTestLocalNotification = onTestLocalNotification,
                onStartSessionPolling = onStartSessionPolling,
                onStopSessionPolling = onStopSessionPolling,
                onRefreshSession = onRefreshSession,
            )
        }
        composable("messages") {
            MessagesScreen(
                state = state,
                onRefresh = onRefresh,
                onLoadMore = onLoadMore,
                onLogout = onLogout,
                onOpenSettings = { nav.navigate("settings") },
                onOpenWhatsApp = onOpenWhatsApp,
                onClearFlash = onClearFlash,
                onSearchChange = onSearchChange,
                onFilterChange = onFilterChange,
                onFolderChange = onFolderChange,
                onToggleExpanded = onToggleExpanded,
                onToggleStar = onToggleStar,
                onToggleThumbsUp = onToggleThumbsUp,
                onToggleDone = onToggleDone,
                onMarkAllSeen = onMarkAllSeen,
            )
        }
    }
}

@Composable
private fun SplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.ic_launcher_foreground),
                contentDescription = null,
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(20.dp)),
            )
            Text(
                "WA Relay",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    hostUrl: String,
    username: String?,
    whatsappSession: WhatsAppSessionStatus,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
    onTestLocalNotification: () -> Unit,
    onStartSessionPolling: () -> Unit,
    onStopSessionPolling: () -> Unit,
    onRefreshSession: () -> Unit,
) {
    var value by remember(hostUrl) { mutableStateOf(hostUrl) }
    LaunchedEffect(Unit) {
        onStartSessionPolling()
    }
    DisposableEffect(Unit) {
        onDispose { onStopSessionPolling() }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onRefreshSession) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh session status")
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
            if (!username.isNullOrBlank()) {
                Text(
                    "Signed in as $username",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
            }
            WhatsAppSessionCard(session = whatsappSession, hostUrl = value.ifBlank { hostUrl })
            Text("Backend base URL (no trailing slash needed)")
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("http://192.168.1.10:3000") },
            )
            Text(
                "Emulator: http://10.0.2.2:3000\nDevice / MuMu: http://<PC-LAN-IP>:3000",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = { onSave(value) }, modifier = Modifier.fillMaxWidth()) {
                Text("Save")
            }
            OutlinedButton(
                onClick = onTestLocalNotification,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Test local notification (5s)")
            }
            Text(
                "Press, then immediately go Home. If banner appears in 5s, notification channel works; FCM/MuMu may still be the issue.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun WhatsAppSessionCard(session: WhatsAppSessionStatus, hostUrl: String) {
    val okColor = Color(0xFF1B7F4A)
    val badColor = Color(0xFFB3261E)
    val checking = session.loading && session.status == null && session.error == null
    val sessionOk = session.reachable && session.ok
    val tint = if (checking) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else if (sessionOk) {
        okColor
    } else {
        badColor
    }
    val headline = if (checking) {
        "WhatsApp session"
    } else if (sessionOk) {
        "WhatsApp session: OK"
    } else {
        "WhatsApp session: not OK"
    }
    val detailText = when {
        checking -> "Checking..."
        !session.reachable || session.error != null -> session.error ?: "Backend unreachable"
        sessionOk -> "Connected (open)"
        session.status == "qr" || session.hasQr -> "Needs QR scan - open " + hostUrl.trimEnd('/') + "/qr"
        session.status == "starting" -> "Starting... wait a moment"
        session.status == "close" -> "Disconnected - reconnecting or needs QR"
        else -> "Status: " + (session.status ?: "unknown")
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.10f))
            .border(1.dp, tint.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (checking) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = tint,
            )
        } else {
            Icon(
                imageVector = if (sessionOk) Icons.Filled.CheckCircle else Icons.Filled.Close,
                contentDescription = null,
                tint = tint,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = headline, fontWeight = FontWeight.SemiBold, color = tint)
            Text(
                text = detailText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(
    state: UiState,
    onLogin: (String, String) -> Unit,
    onOpenSettings: () -> Unit,
    onClearFlash: () -> Unit,
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val context = LocalContext.current

    LaunchedEffect(state.error) {
        val msg = state.error ?: return@LaunchedEffect
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        onClearFlash()
    }
    LaunchedEffect(state.info) {
        val msg = state.info ?: return@LaunchedEffect
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        onClearFlash()
    }

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
        Box(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            Column(
                Modifier
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
                Button(
                    onClick = { onLogin(username.trim(), password) },
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Login") }
            }
            if (state.loading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(
    state: UiState,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onLogout: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenWhatsApp: (String?) -> Unit,
    onClearFlash: () -> Unit,
    onSearchChange: (String) -> Unit,
    onFilterChange: (InboxFilter) -> Unit,
    onFolderChange: (InboxFolder) -> Unit,
    onToggleExpanded: (MatchedMessage) -> Unit,
    onToggleStar: (MatchedMessage) -> Unit,
    onToggleThumbsUp: (MatchedMessage) -> Unit,
    onToggleDone: (MatchedMessage) -> Unit,
    onMarkAllSeen: () -> Unit,
) {
    var searchExpanded by remember { mutableStateOf(false) }
    var filterMenuExpanded by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val showScrollTop by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 80
        }
    }

    LaunchedEffect(listState, state.hasMore, state.loadingMore, state.loading, state.messages.size) {
        snapshotFlow {
            val info = listState.layoutInfo
            val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            val total = info.totalItemsCount
            lastVisible to total
        }.collect { (lastVisible, total) ->
            if (
                state.hasMore &&
                !state.loading &&
                !state.loadingMore &&
                total > 0 &&
                lastVisible >= total - 4
            ) {
                onLoadMore()
            }
        }
    }

    LaunchedEffect(state.error) {
        val msg = state.error ?: return@LaunchedEffect
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        onClearFlash()
    }
    LaunchedEffect(state.info) {
        val msg = state.info ?: return@LaunchedEffect
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        onClearFlash()
    }

    Scaffold(
        contentWindowInsets = WindowInsets.statusBars,
    ) { padding ->
        Box(
            Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            Column(Modifier.fillMaxSize()) {
                Surface(
                    tonalElevation = 1.dp,
                    shadowElevation = 0.dp,
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // Row 1: folder chips or expanded search
                        if (searchExpanded) {
                            val searchBorder = MaterialTheme.colorScheme.outline.copy(alpha = 0.7f)
                            val searchText = MaterialTheme.colorScheme.onSurface
                            BasicTextField(
                                value = state.searchQuery,
                                onValueChange = onSearchChange,
                                singleLine = true,
                                textStyle = TextStyle(
                                    color = searchText,
                                    fontSize = 14.sp,
                                    lineHeight = 18.sp,
                                ),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(36.dp)
                                    .padding(horizontal = 6.dp, vertical = 4.dp),
                                decorationBox = { inner ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .border(1.dp, searchBorder, RoundedCornerShape(8.dp))
                                            .background(
                                                MaterialTheme.colorScheme.surface,
                                                RoundedCornerShape(8.dp),
                                            )
                                            .padding(start = 10.dp, end = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(
                                            modifier = Modifier.weight(1f),
                                            contentAlignment = Alignment.CenterStart,
                                        ) {
                                            if (state.searchQuery.isEmpty()) {
                                                Text(
                                                    "Search…",
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    fontSize = 14.sp,
                                                    maxLines = 1,
                                                )
                                            }
                                            inner()
                                        }
                                        IconButton(
                                            onClick = {
                                                searchExpanded = false
                                                if (state.searchQuery.isNotEmpty()) onSearchChange("")
                                            },
                                            modifier = Modifier.size(32.dp),
                                        ) {
                                            Icon(
                                                Icons.Default.Close,
                                                contentDescription = "Close search",
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                    }
                                },
                            )
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState())
                                    .padding(start = 6.dp, end = 6.dp, top = 4.dp, bottom = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                InboxFolder.entries.forEach { folder ->
                                    val unread = state.folderUnread[folder.apiValue] ?: 0
                                    FilterChip(
                                        selected = state.folder == folder,
                                        onClick = { onFolderChange(folder) },
                                        modifier = Modifier.height(32.dp),
                                        label = {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(
                                                    folderLabel(folder),
                                                    fontSize = 12.sp,
                                                    maxLines = 1,
                                                )
                                                if (unread > 0) {
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Badge {
                                                        Text(
                                                            if (unread > 99) "99+" else unread.toString(),
                                                            fontSize = 10.sp,
                                                        )
                                                    }
                                                }
                                            }
                                        },
                                    )
                                }
                            }
                        }

                        // Row 2: action icons
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 2.dp, end = 2.dp, bottom = 2.dp),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val folderUnread = state.folderUnread[state.folder.apiValue] ?: 0
                            IconButton(
                                onClick = onMarkAllSeen,
                                enabled = folderUnread > 0,
                                modifier = Modifier.size(40.dp),
                            ) {
                                Icon(
                                    Icons.Default.DoneAll,
                                    contentDescription = "Mark all seen",
                                    modifier = Modifier.size(20.dp),
                                )
                            }

                            Box {
                                IconButton(
                                    onClick = { filterMenuExpanded = true },
                                    modifier = Modifier.size(40.dp),
                                ) {
                                    Icon(
                                        Icons.Default.FilterList,
                                        contentDescription = "Filter",
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                                if (state.filter != InboxFilter.ALL) {
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(top = 8.dp, end = 8.dp)
                                            .size(7.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.primary),
                                    )
                                }
                                DropdownMenu(
                                    expanded = filterMenuExpanded,
                                    onDismissRequest = { filterMenuExpanded = false },
                                ) {
                                    InboxFilter.entries.forEach { filter ->
                                        DropdownMenuItem(
                                            text = { Text(filterLabel(filter)) },
                                            onClick = {
                                                onFilterChange(filter)
                                                filterMenuExpanded = false
                                            },
                                            trailingIcon = if (state.filter == filter) {
                                                {
                                                    Icon(
                                                        Icons.Default.CheckCircle,
                                                        contentDescription = null,
                                                        modifier = Modifier.size(16.dp),
                                                    )
                                                }
                                            } else {
                                                null
                                            },
                                        )
                                    }
                                }
                            }

                            IconButton(
                                onClick = {
                                    if (searchExpanded) {
                                        searchExpanded = false
                                        if (state.searchQuery.isNotEmpty()) onSearchChange("")
                                    } else {
                                        searchExpanded = true
                                    }
                                },
                                modifier = Modifier.size(40.dp),
                            ) {
                                Icon(
                                    Icons.Default.Search,
                                    contentDescription = "Search",
                                    modifier = Modifier.size(20.dp),
                                    tint = if (searchExpanded || state.searchQuery.isNotEmpty()) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        LocalContentColor.current
                                    },
                                )
                            }
                            IconButton(onClick = onRefresh, modifier = Modifier.size(40.dp)) {
                                Icon(
                                    Icons.Default.Refresh,
                                    contentDescription = "Refresh",
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                            IconButton(onClick = onOpenSettings, modifier = Modifier.size(40.dp)) {
                                Icon(
                                    Icons.Default.Settings,
                                    contentDescription = "Settings",
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                            IconButton(onClick = onLogout, modifier = Modifier.size(40.dp)) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Logout,
                                    contentDescription = "Logout",
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }

                if (!state.loading && state.messages.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "No messages",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else if (state.messages.isNotEmpty()) {
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(bottom = 72.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(state.messages, key = { it.id.ifBlank { it.messageId } }) { msg ->
                            val rowId = msg.id.ifBlank { msg.messageId }
                            MessageRow(
                                msg = msg,
                                expanded = state.expandedId == rowId,
                                onToggleExpanded = { onToggleExpanded(msg) },
                                onToggleStar = { onToggleStar(msg) },
                                onToggleThumbsUp = { onToggleThumbsUp(msg) },
                                onToggleDone = { onToggleDone(msg) },
                                onOpenWhatsApp = { onOpenWhatsApp(buildWaMeUrl(msg.waLink, msg.text)) },
                            )
                            HorizontalDivider()
                        }
                        if (state.loadingMore) {
                            item(key = "loading-more") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                                }
                            }
                        }
                    }
                }
            }

            if (showScrollTop && state.messages.isNotEmpty()) {
                FloatingActionButton(
                    onClick = {
                        scope.launch { listState.animateScrollToItem(0) }
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(16.dp),
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ) {
                    Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Scroll to top")
                }
            }

            if (state.loading && state.messages.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

@Composable
private fun MessageRow(
    msg: MatchedMessage,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    onToggleStar: () -> Unit,
    onToggleThumbsUp: () -> Unit,
    onToggleDone: () -> Unit,
    onOpenWhatsApp: () -> Unit,
) {
    val sender = displaySender(msg)
    val canOpenWhatsApp = isValidWaLink(msg.waLink)
    Surface(
        color = if (msg.isUnread) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.06f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            Modifier
                .clickable(onClick = onToggleExpanded)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(top = 6.dp, end = 10.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(
                            if (msg.isUnread) MaterialTheme.colorScheme.primary
                            else Color.Transparent,
                        ),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = sender,
                            fontWeight = if (msg.isUnread) FontWeight.Bold else FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color.Transparent,
                            border = BorderStroke(
                                1.dp,
                                MaterialTheme.colorScheme.outline.copy(alpha = 0.55f),
                            ),
                        ) {
                            Text(
                                text = "In: ${formatTime(msg.createdAt)} · Read: ${formatTime(msg.readAt)}",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                fontSize = 10.sp,
                            )
                        }
                        if (msg.isGroup) {
                            Icon(
                                Icons.Default.Groups,
                                contentDescription = "Group",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (msg.starred) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = "Starred",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                        if (msg.thumbsUp) {
                            Icon(
                                Icons.Default.ThumbUp,
                                contentDescription = "Thumbs up",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                        if (msg.done) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "Done",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }
                    Text(
                        text = msg.text,
                        maxLines = if (expanded) Int.MAX_VALUE else 2,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            AnimatedVisibility(visible = expanded) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, start = 18.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    IconButton(onClick = onToggleStar) {
                        Icon(
                            if (msg.starred) Icons.Default.Star else Icons.Default.StarBorder,
                            contentDescription = if (msg.starred) "Unstar" else "Star",
                            tint = if (msg.starred) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onToggleThumbsUp) {
                        Icon(
                            if (msg.thumbsUp) Icons.Default.ThumbUp else Icons.Outlined.ThumbUp,
                            contentDescription = if (msg.thumbsUp) "Remove thumbs up" else "Thumbs up",
                            tint = if (msg.thumbsUp) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onToggleDone) {
                        Icon(
                            if (msg.done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                            contentDescription = if (msg.done) "Mark not done" else "Mark done",
                            tint = if (msg.done) MaterialTheme.colorScheme.secondary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(
                        onClick = onOpenWhatsApp,
                        enabled = canOpenWhatsApp,
                    ) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open WhatsApp")
                    }
                }
            }
        }
    }
}

private fun displaySender(msg: MatchedMessage): String {
    val name = msg.senderName?.trim()?.takeUnless { it.isEmpty() || it == "null" }
    val phone = msg.senderPhone?.trim()?.takeUnless { it.isEmpty() || it == "null" }
    val sender = name ?: phone ?: "Unknown"
    val group = msg.groupName?.trim()?.takeUnless { it.isEmpty() || it == "null" }
    return if (msg.isGroup && !group.isNullOrBlank()) "$sender · $group" else sender
}

private fun isValidWaLink(link: String?): Boolean {
    val url = link?.trim().orEmpty()
    return url.startsWith("https://wa.me/") && url.length > "https://wa.me/".length
}

/** Prefills WhatsApp compose with order text (`?text=`). No intro. */
private fun buildWaMeUrl(waLink: String?, text: String?): String? {
    if (!isValidWaLink(waLink)) return null
    val base = waLink!!.trim().substringBefore("?")
    val body = text?.trim().orEmpty()
    if (body.isEmpty()) return base
    val truncated = if (body.length > WA_TEXT_MAX_CHARS) body.take(WA_TEXT_MAX_CHARS) else body
    val encoded = URLEncoder.encode(truncated, StandardCharsets.UTF_8.name()).replace("+", "%20")
    return "$base?text=$encoded"
}

private const val WA_TEXT_MAX_CHARS = 1500

private fun filterLabel(filter: InboxFilter): String = when (filter) {
    InboxFilter.ALL -> "All"
    InboxFilter.UNREAD -> "Unread"
    InboxFilter.STARRED -> "Starred"
    InboxFilter.THUMBS_UP -> "Thumbs up"
    InboxFilter.DONE -> "Done"
    InboxFilter.GROUPS -> "Groups"
}

private fun folderLabel(folder: InboxFolder): String = when (folder) {
    InboxFolder.ALL -> "All"
    InboxFolder.LGW -> "LGW"
    InboxFolder.LHR -> "LHR"
    InboxFolder.LTN -> "LTN"
    InboxFolder.STN -> "STN"
    InboxFolder.OTHERS -> "Others"
}

private val displayFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd MMM HH:mm").withZone(ZoneId.systemDefault())

private fun formatTime(raw: String?): String {
    if (raw.isNullOrBlank()) return "—"
    return runCatching {
        val instant = Instant.parse(raw)
        displayFormatter.format(instant)
    }.getOrElse {
        raw.take(16).replace('T', ' ')
    }
}
