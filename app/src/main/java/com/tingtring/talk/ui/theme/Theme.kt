package com.tingtring.talk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight

private val TttBlue = Color(0xFF2457E6)
private val TttBlueDark = Color(0xFF173EAF)
private val TttBlueSoft = Color(0xFFEAF0FF)
private val TttBackground = Color(0xFFF7F9FC)
private val TttText = Color(0xFF111827)
private val TttMuted = Color(0xFF667085)

@Composable
fun TingTringTheme(content: @Composable () -> Unit) {
    val colors = lightColorScheme(
        primary = TttBlue,
        onPrimary = Color.White,
        primaryContainer = TttBlueSoft,
        onPrimaryContainer = TttBlueDark,
        secondary = Color(0xFF52627A),
        onSecondary = Color.White,
        background = TttBackground,
        onBackground = TttText,
        surface = Color.White,
        onSurface = TttText,
        surfaceVariant = Color(0xFFF0F3F8),
        onSurfaceVariant = TttMuted
    )

    val typography = Typography().run {
        copy(
            headlineLarge = headlineLarge.copy(fontWeight = FontWeight.Bold),
            headlineMedium = headlineMedium.copy(fontWeight = FontWeight.Bold),
            titleLarge = titleLarge.copy(fontWeight = FontWeight.SemiBold),
            titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
            labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold)
        )
    }

    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
