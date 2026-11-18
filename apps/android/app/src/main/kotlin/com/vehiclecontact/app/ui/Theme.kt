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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border

// Bahasa visual yang sama dengan web: navy + biru, kartu membulat 20-24dp
val Ink = Color(0xFF0A1A35)
val Navy900 = Color(0xFF060C17)
val Brand = Color(0xFF2B7FE8)
val BrandDeep = Color(0xFF1A56A8)
val BrandSoft = Color(0xFFE6F0FE)
val Paper = Color(0xFFF4F7FB)
val Mint = Color(0xFFDDF5EA)
val MintDeep = Color(0xFF0B7A55)
val Green = Color(0xFF13B77D)
val Coral = Color(0xFFE5484D)
val CoralSoft = Color(0xFFFDE8E8)
val CoralDeep = Color(0xFFB42318)
val Amber = Color(0xFFFEF1D6)
val AmberDeep = Color(0xFF9A5B00)
val Sky = Color(0xFFE6F0FE)
val SkyDeep = Color(0xFF1A56A8)
val Muted = Color(0xFF6B7A90)

/** Latar "hero" gradien navy → biru (sama dengan web). */
val HeroBrush = Brush.verticalGradient(listOf(Navy900, Color(0xFF0A1A35), Color(0xFF143A78)))
val BrandBrush = Brush.horizontalGradient(listOf(Brand, BrandDeep))

@Composable
fun VecsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Brand, onPrimary = Color.White, secondary = Mint, onSecondary = Ink,
            background = Paper, onBackground = Ink, surface = Color.White, onSurface = Ink,
            surfaceVariant = Color(0xFFEEF3FA), onSurfaceVariant = Muted, error = Coral, outline = Color(0xFFDDE5F0),
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
