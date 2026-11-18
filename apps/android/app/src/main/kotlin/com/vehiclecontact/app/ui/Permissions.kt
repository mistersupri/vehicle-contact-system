package com.vehiclecontact.app.ui

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

data class Readiness(val notifications: Boolean, val microphone: Boolean, val fullScreen: Boolean, val battery: Boolean) {
    val allOk get() = notifications && microphone && fullScreen && battery
}

fun readiness(ctx: Context): Readiness {
    val notif = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val mic = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val full = Build.VERSION.SDK_INT < 34 || ctx.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    val battery = (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    return Readiness(notif, mic, full, battery)
}

/** Daftar izin yang membuat panggilan bisa berdering layar penuh. Dihitung ulang setiap aplikasi kembali ke depan. */
@Composable
fun rememberReadiness(): State<Readiness> {
    val ctx = LocalContext.current
    val state = remember { mutableStateOf(readiness(ctx)) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) state.value = readiness(ctx) }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    return state
}

@Composable
fun ReadinessCard(alwaysShow: Boolean = false) {
    val ctx = LocalContext.current
    val r by rememberReadiness()
    if (r.allOk && !alwaysShow) return
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val micLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    Panel(color = if (r.allOk) Mint else Amber, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(if (r.allOk) "Siap menerima panggilan layar penuh" else "Siapkan penerimaan panggilan", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = if (r.allOk) MintDeep else AmberDeep)
            if (!r.allOk) Text("Agar panggilan berdering layar penuh walau layar terkunci atau aplikasi tertutup, aktifkan izin berikut.", fontSize = 13.sp, color = AmberDeep, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            Item("Notifikasi", r.notifications) { notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }
            Item("Mikrofon (untuk menjawab)", r.microphone) { micLauncher.launch(Manifest.permission.RECORD_AUDIO) }
            Item("Tampilan layar penuh saat panggilan", r.fullScreen) {
                if (Build.VERSION.SDK_INT >= 34) ctx.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${ctx.packageName}")))
            }
            Item("Tanpa pembatasan baterai", r.battery) {
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
                runCatching { ctx.startActivity(i) }.onFailure { ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            }
            if (!r.battery) Text("Beberapa ponsel (Xiaomi, Oppo, Vivo, Samsung) juga punya pengaturan \"Mulai otomatis\"/\"Aplikasi latar belakang\" sendiri; aktifkan untuk aplikasi ini agar koneksi tidak dimatikan sistem.", fontSize = 12.sp, color = AmberDeep, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun Item(label: String, ok: Boolean, onEnable: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(if (ok) "✓" else "○", fontWeight = FontWeight.Bold, color = if (ok) MintDeep else AmberDeep, modifier = Modifier.width(24.dp))
        Text(label, modifier = Modifier.weight(1f), fontSize = 14.sp, color = Ink)
        if (!ok) SmallButton("Aktifkan", onEnable, dark = true)
    }
}
