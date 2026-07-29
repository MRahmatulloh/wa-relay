package com.warelay.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Teal = Color(0xFF0F766E)
private val Ink = Color(0xFF134E4A)
private val Sand = Color(0xFFF0FDFA)

@Composable
fun WaRelayTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Teal,
            onPrimary = Color.White,
            secondary = Ink,
            background = Sand,
            surface = Color.White,
        ),
        content = content,
    )
}
