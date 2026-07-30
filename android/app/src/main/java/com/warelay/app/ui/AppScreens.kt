package com.warelay.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
    onToggleDone: (MatchedMessage) -> Unit,
    onTestLocalNotification: () -> Unit,
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
                onSave = {
                    onSaveHost(it)
                    nav.popBackStack()
                },
                onBack = { nav.popBackStack() },
                onTestLocalNotification = onTestLocalNotification,
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
                onToggleDone = onToggleDone,
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
    onSave: (String) -> Unit,
    onBack: () -> Unit,
    onTestLocalNotification: () -> Unit,
) {
    var value by remember(hostUrl) { mutableStateOf(hostUrl) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
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
    onToggleDone: (MatchedMessage) -> Unit,
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
        topBar = {
            TopAppBar(
                title = { Text("Inbox") },
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Logout")
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
            Column(Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    InboxFolder.entries.forEach { folder ->
                        val unread = state.folderUnread[folder.apiValue] ?: 0
                        FilterChip(
                            selected = state.folder == folder,
                            onClick = { onFolderChange(folder) },
                            label = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(folderLabel(folder))
                                    if (unread > 0) {
                                        Spacer(Modifier.width(6.dp))
                                        Badge {
                                            Text(if (unread > 99) "99+" else unread.toString())
                                        }
                                    }
                                }
                            },
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ExposedDropdownMenuBox(
                        expanded = filterMenuExpanded,
                        onExpandedChange = { filterMenuExpanded = it },
                        modifier = Modifier.weight(1f),
                    ) {
                        OutlinedTextField(
                            value = filterLabel(state.filter),
                            onValueChange = {},
                            readOnly = true,
                            singleLine = true,
                            label = { Text("Filter") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = filterMenuExpanded)
                            },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .fillMaxWidth(),
                        )
                        ExposedDropdownMenu(
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
                                )
                            }
                        }
                    }

                    if (searchExpanded) {
                        OutlinedTextField(
                            value = state.searchQuery,
                            onValueChange = onSearchChange,
                            modifier = Modifier.weight(1.4f),
                            singleLine = true,
                            placeholder = { Text("Search…") },
                            trailingIcon = {
                                IconButton(
                                    onClick = {
                                        searchExpanded = false
                                        if (state.searchQuery.isNotEmpty()) onSearchChange("")
                                    },
                                ) {
                                    Icon(Icons.Default.Close, contentDescription = "Close search")
                                }
                            },
                        )
                    } else {
                        IconButton(onClick = { searchExpanded = true }) {
                            Icon(Icons.Default.Search, contentDescription = "Search")
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
                                onToggleDone = { onToggleDone(msg) },
                                onOpenWhatsApp = { onOpenWhatsApp(msg.waLink) },
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
    onToggleDone: () -> Unit,
    onOpenWhatsApp: () -> Unit,
) {
    val sender = msg.senderName ?: msg.senderPhone ?: "Unknown"
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = sender,
                            fontWeight = if (msg.isUnread) FontWeight.Bold else FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (msg.isGroup) {
                            Icon(
                                Icons.Default.Groups,
                                contentDescription = "Group",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.width(4.dp))
                        }
                        if (msg.starred) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = "Starred",
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
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "In: ${formatTime(msg.createdAt)}  ·  Read: ${formatTime(msg.readAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (!msg.matchedPattern.isNullOrBlank()) {
                        Text(
                            text = "Pattern: ${msg.matchedPattern}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
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
                        enabled = !msg.waLink.isNullOrBlank(),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open WhatsApp")
                    }
                }
            }
        }
    }
}

private fun filterLabel(filter: InboxFilter): String = when (filter) {
    InboxFilter.ALL -> "All"
    InboxFilter.UNREAD -> "Unread"
    InboxFilter.STARRED -> "Starred"
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
