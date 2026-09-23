package com.tingtring.talk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight

@Composable fun TingTringTheme(content:@Composable()->Unit){
 val blue=Color(0xFF2457E6);val bg=Color(0xFFF6F8FC);val text=Color(0xFF101828);val muted=Color(0xFF667085)
 MaterialTheme(colorScheme=androidx.compose.material3.lightColorScheme(primary=blue,onPrimary=Color.White,primaryContainer=Color(0xFFE9EEFF),onPrimaryContainer=Color(0xFF1944C0),background=bg,onBackground=text,surface=Color.White,onSurface=text,surfaceVariant=Color(0xFFF2F4F7),onSurfaceVariant=muted),
 typography=Typography(headlineLarge=Typography().headlineLarge.copy(fontWeight=FontWeight.Bold),headlineMedium=Typography().headlineMedium.copy(fontWeight=FontWeight.Bold),titleLarge=Typography().titleLarge.copy(fontWeight=FontWeight.SemiBold)),content=content)
}
