package com.tingtring.talk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight

private val TtBlue = Color(0xFF2457E6)
private val TtBackground = Color(0xFFF7F8FC)
private val TtText = Color(0xFF101828)
private val TtMuted = Color(0xFF667085)

@Composable
fun TingTringTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = androidx.compose.material3.lightColorScheme(
            primary = TtBlue,
            onPrimary = Color.White,
            background = TtBackground,
            onBackground = TtText,
            surface = Color.White,
            onSurface = TtText
        ),
        typography = Typography(
            headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
            titleLarge = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
            bodyMedium = MaterialTheme.typography.bodyMedium.copy(color = TtMuted)
        ),
        content = content
    )
}