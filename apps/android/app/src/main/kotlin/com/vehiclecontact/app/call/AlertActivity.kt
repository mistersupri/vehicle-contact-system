package com.vehiclecontact.app.call

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vehiclecontact.app.MainActivity
import com.vehiclecontact.app.ui.Coral
import com.vehiclecontact.app.ui.HeroBrush
import com.vehiclecontact.app.ui.PlateBadge
import com.vehiclecontact.app.ui.VecsTheme
import com.vehiclecontact.app.vecs

/**
 * Layar penuh "Notifikasi Mendesak": menyerupai panggilan masuk, tetapi BUKAN panggilan —
 * tanpa audio, tanpa WebRTC, tanpa TURN. Tampil di atas layar kunci dan menyalakan layar.
 */
class AlertActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val engine = vecs.engine

        setContent {
            VecsTheme {
                val alert by engine.alert.collectAsStateWithLifecycle()
                LaunchedEffect(alert) { if (alert == null) finish() }
                val a = alert
                if (a != null) {
                    val close = {
                        engine.dismissAlert()
                        getSystemService(NotificationManager::class.java).cancel(NotificationHelper.ID_ALERT)
                        finish()
                    }
                    UrgentScreen(
                        name = a.vehicleName, plate = a.plate, label = a.categoryLabel, message = a.message,
                        onOpen = {
                            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                            close()
                        },
                        onDismiss = close,
                    )
                }
            }
        }
    }

    companion object {
        fun intent(ctx: Context) = Intent(ctx, AlertActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
}

@Composable
private fun UrgentScreen(name: String?, plate: String, label: String, message: String?, onOpen: () -> Unit, onDismiss: () -> Unit) {
    Column(Modifier.fillMaxSize().background(HeroBrush).systemBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.clip(CircleShape).background(Color.White.copy(alpha = .12f)).padding(horizontal = 14.dp, vertical = 6.dp)) {
            Text("NOTIFIKASI MENDESAK · BUKAN PANGGILAN", color = Color.White.copy(alpha = .85f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(Modifier.size(112.dp).clip(CircleShape).background(Coral), contentAlignment = Alignment.Center) { Text("!", color = Color.White, fontSize = 56.sp, fontWeight = FontWeight.ExtraBold) }
            Spacer(Modifier.height(28.dp))
            Text(name ?: "Kendaraan Anda", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
            PlateBadge(plate, large = true)
            Spacer(Modifier.height(20.dp))
            Box(Modifier.clip(CircleShape).background(Color.White.copy(alpha = .14f)).padding(horizontal = 16.dp, vertical = 7.dp)) { Text(label, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
            Spacer(Modifier.height(18.dp))
            Text(message?.takeIf { it.isNotBlank() } ?: "Seseorang membutuhkan respons Anda segera.", color = Color.White.copy(alpha = .78f), fontSize = 17.sp, textAlign = TextAlign.Center)
        }
        Box(Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).clickable(onClick = onOpen), contentAlignment = Alignment.Center) {
            Text("Lihat Laporan", color = Color(0xFF0A1A35), fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(18.dp)).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
            Text("Tutup", color = Color.White.copy(alpha = .8f), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
    }
}
