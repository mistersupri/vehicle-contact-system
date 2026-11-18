package com.vehiclecontact.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border

// Bahasa visual yang sama dengan web: monokrom hangat + mint + koral, kartu sangat membulat
val Ink = Color(0xFF101011)
val Paper = Color(0xFFEEEEEC)
val Mint = Color(0xFFCDE8DA)
val MintDeep = Color(0xFF1E6B4B)
val Coral = Color(0xFFE5645E)
val CoralSoft = Color(0xFFFBE4E2)
val CoralDeep = Color(0xFFB03A35)
val Amber = Color(0xFFFBEFD2)
val AmberDeep = Color(0xFF8A5A00)
val Sky = Color(0xFFE1ECF7)
val SkyDeep = Color(0xFF2A5A8C)
val Muted = Color(0xFF757571)

@Composable
fun VecsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Ink, onPrimary = Color.White, secondary = Mint, onSecondary = Ink,
            background = Paper, onBackground = Ink, surface = Color.White, onSurface = Ink,
            surfaceVariant = Color(0xFFF4F4F2), onSurfaceVariant = Muted, error = Coral, outline = Color(0xFFD9D9D5),
        ),
        content = content,
    )
}

/** Pelat nomor bergaya plat kendaraan. */
@Composable
fun PlateBadge(text: String, large: Boolean = false, modifier: Modifier = Modifier) {
    Box(
        modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).border(BorderStroke(if (large) 3.dp else 2.dp, Ink), RoundedCornerShape(10.dp))
            .padding(horizontal = if (large) 18.dp else 10.dp, vertical = if (large) 8.dp else 3.dp),
    ) {
        Text(text, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = if (large) 30.sp else 14.sp, letterSpacing = 1.sp)
    }
}
