package com.vehiclecontact.app.call

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vehiclecontact.app.ui.Coral
import com.vehiclecontact.app.ui.Ink
import com.vehiclecontact.app.ui.HeroBrush
import com.vehiclecontact.app.ui.Green
import com.vehiclecontact.app.ui.Mint
import com.vehiclecontact.app.ui.PlateBadge
import com.vehiclecontact.app.ui.VecsTheme
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.CallState

/** Layar panggilan penuh: tampil di atas layar kunci dan menyalakan layar (panggilan masuk, berlangsung, selesai). */
class CallActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val engine = vecs.engine
        val autoAccept = intent.getBooleanExtra(EXTRA_ACCEPT, false)

        setContent {
            VecsTheme {
                val state by engine.state.collectAsStateWithLifecycle()
                val seconds by engine.seconds.collectAsStateWithLifecycle()
                val muted by engine.muted.collectAsStateWithLifecycle()
                val speaker by engine.speaker.collectAsStateWithLifecycle()

                var acceptedFromNotification by remember { mutableStateOf(false) }
                val doAccept = {
                    engine.accept()
                }
                val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                    if (granted) doAccept() else {
                        Toast.makeText(this@CallActivity, "Izin mikrofon diperlukan untuk menjawab panggilan", Toast.LENGTH_LONG).show()
                        engine.reject()
                    }
                }
                val accept = {
                    if (ContextCompat.checkSelfPermission(this@CallActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) doAccept()
                    else permission.launch(Manifest.permission.RECORD_AUDIO)
                }
                LaunchedEffect(state, autoAccept) {
                    if (autoAccept && !acceptedFromNotification && state is CallState.Ringing) { acceptedFromNotification = true; accept() }
                    if (state is CallState.Idle) finish()
                }

                Box(Modifier.fillMaxSize().background(HeroBrush).systemBarsPadding(), contentAlignment = Alignment.Center) {
                    when (val s = state) {
                        is CallState.Ringing -> IncomingUi(s.vehicleName, s.plate, onAccept = { accept() }, onReject = { engine.reject() })
                        is CallState.Connecting -> InCallUi(s.vehicleName, s.plate, "Menyambungkan audio…", muted, speaker, engine::toggleMute, engine::toggleSpeaker, engine::hangup)
                        is CallState.Connected -> InCallUi(s.vehicleName, s.plate, "%d:%02d".format(seconds / 60, seconds % 60), muted, speaker, engine::toggleMute, engine::toggleSpeaker, engine::hangup)
                        is CallState.Ended -> EndedUi(s.message)
                        CallState.Idle -> {}
                    }
                }
            }
        }
    }

    companion object {
        const val EXTRA_ACCEPT = "accept"
        fun intent(ctx: Context, accept: Boolean = false) =
            Intent(ctx, CallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(EXTRA_ACCEPT, accept)
    }
}

@Composable
private fun RoundButton(color: Color, label: String, content: String, onClick: () -> Unit, contentColor: Color = Color.White) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(76.dp).clip(CircleShape).background(color).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
            Text(content, color = contentColor, fontSize = 30.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp)); Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun IncomingUi(name: String?, plate: String, onAccept: () -> Unit, onReject: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceBetween) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            Text(if (name != null) "Panggilan masuk · $name" else "Panggilan masuk dari QR kendaraan", color = Color.White.copy(alpha = .6f), fontSize = 14.sp)
            Spacer(Modifier.height(32.dp))
            Box(Modifier.size(120.dp).clip(CircleShape).background(Color.White.copy(alpha = .16f)), contentAlignment = Alignment.Center) { Text("📞", fontSize = 48.sp) }
            Spacer(Modifier.height(32.dp))
            PlateBadge(plate, large = true)
            Spacer(Modifier.height(20.dp))
            Text("Seseorang di dekat kendaraan Anda ingin berbicara. Nomor Anda tidak terlihat olehnya.", color = Color.White.copy(alpha = .6f), textAlign = TextAlign.Center, fontSize = 14.sp)
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 32.dp, start = 24.dp, end = 24.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            RoundButton(Coral, "Tolak", "✕", onReject)
            RoundButton(Green, "Terima", "✓", onAccept)
        }
    }
}

@Composable
private fun InCallUi(name: String?, plate: String, status: String, muted: Boolean, speaker: Boolean, onMute: () -> Unit, onSpeaker: () -> Unit, onEnd: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceBetween) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            if (name != null) { Text(name, color = Color.White.copy(alpha = .8f), fontSize = 15.sp); Spacer(Modifier.height(8.dp)) }
            PlateBadge(plate)
            Spacer(Modifier.height(40.dp))
            Box(Modifier.size(128.dp).clip(CircleShape).background(Color.White.copy(alpha = .16f)), contentAlignment = Alignment.Center) { Text("P", fontSize = 48.sp, fontWeight = FontWeight.Bold, color = Color.White) }
            Spacer(Modifier.height(28.dp))
            Text("Pengunjung", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.SemiBold)
            Text(status, color = Color.White.copy(alpha = .7f), fontSize = 18.sp)
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 32.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            RoundButton(if (muted) Color.White else Color.White.copy(alpha = .15f), if (muted) "Mikrofon mati" else "Bisukan", "🎤", onMute, contentColor = if (muted) Ink else Color.White)
            RoundButton(Coral, "Akhiri", "✕", onEnd)
            RoundButton(if (speaker) Color.White else Color.White.copy(alpha = .15f), "Speaker", "🔊", onSpeaker, contentColor = if (speaker) Ink else Color.White)
        }
    }
}

@Composable
private fun EndedUi(message: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
        Box(Modifier.size(96.dp).clip(CircleShape).background(Color.White.copy(alpha = .12f)), contentAlignment = Alignment.Center) { Text("✓", color = Color.White, fontSize = 40.sp) }
        Spacer(Modifier.height(24.dp))
        Text(message, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}
