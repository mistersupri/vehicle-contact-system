package com.vehiclecontact.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vehiclecontact.app.BuildConfig
import com.vehiclecontact.app.call.CallService
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import com.vehiclecontact.core.CallSettings
import com.vehiclecontact.core.CallSettingsInput
import kotlinx.coroutines.launch

private val AVAIL = listOf("ONLINE" to "Saat saya online", "ALWAYS" to "Selalu", "OFFLINE" to "Tidak tersedia")

@Composable
fun SettingsScreen() {
    val ctx = LocalContext.current
    val app = ctx.vecs
    val scope = rememberCoroutineScope()
    val loader = rememberLoader { app.api.callSettings() }
    var form by remember { mutableStateOf<CallSettings?>(null) }
    var saved by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var listen by remember { mutableStateOf(app.session.listenEnabled) }
    var confirmLogout by remember { mutableStateOf(false) }

    val uiNow = loader.ui
    LaunchedEffect(uiNow) { if (uiNow is Ui.Ok && form == null) form = uiNow.value }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(app.session.userEmail ?: "", color = Muted, fontSize = 13.sp)

        Panel(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Siaga panggilan", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Terima panggilan saat aplikasi ditutup", fontWeight = FontWeight.SemiBold)
                        Text("Menjaga koneksi ke server lewat layanan latar belakang (ada notifikasi tetap). Tanpa ini, panggilan hanya berdering saat aplikasi terbuka.", color = Muted, fontSize = 13.sp)
                    }
                    Switch(checked = listen, onCheckedChange = { v -> listen = v; app.session.listenEnabled = v; if (v) CallService.start(ctx) else CallService.stop(ctx) }, colors = SwitchDefaults.colors(checkedTrackColor = Brand))
                }
            }
        }
        ReadinessCard(alwaysShow = true)

        loader.Content { _ ->
            val f = form
            if (f != null) Panel(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Pengaturan panggilan", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    SwitchRow("Panggilan internet (WebRTC)", "Izinkan pemindai QR menelepon Anda lewat browser.", f.webrtc_enabled) { form = f.copy(webrtc_enabled = it) }
                    Text("Ketersediaan", fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) { AVAIL.forEach { (code, label) ->
                        FilterChip(selected = f.call_availability == code, onClick = { form = f.copy(call_availability = code) }, label = { Text(label) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Brand, selectedLabelColor = Color.White))
                    } }
                    SwitchRow("Notifikasi mendesak", "Pengunjung dapat mengirim pemberitahuan layar penuh tanpa panggilan (tidak memakai TURN).", f.allow_urgent_alerts) { form = f.copy(allow_urgent_alerts = it) }
                    SwitchRow("Terima panggilan anonim", "Pengunjung tak perlu mengisi identitas.", f.allow_anonymous_webrtc) { form = f.copy(allow_anonymous_webrtc = it) }
                    SwitchRow("Jam tenang", "Panggilan tidak berdering pada rentang ini. Laporan tetap diterima.", f.quiet_hours.enabled) { form = f.copy(quiet_hours = f.quiet_hours.copy(enabled = it)) }
                    if (f.quiet_hours.enabled) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FormField("Mulai (HH:MM)", f.quiet_hours.start, { form = f.copy(quiet_hours = f.quiet_hours.copy(start = it)) }, Modifier.weight(1f))
                        FormField("Selesai (HH:MM)", f.quiet_hours.end, { form = f.copy(quiet_hours = f.quiet_hours.copy(end = it)) }, Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FormField("Batas dering (dtk)", f.ring_timeout_seconds.toString(), { form = f.copy(ring_timeout_seconds = it.filter(Char::isDigit).toIntOrNull() ?: 0) }, Modifier.weight(1f), keyboard = KeyboardType.Number)
                        FormField("Durasi maks (dtk)", f.max_call_duration_seconds.toString(), { form = f.copy(max_call_duration_seconds = it.filter(Char::isDigit).toIntOrNull() ?: 0) }, Modifier.weight(1f), keyboard = KeyboardType.Number)
                    }
                    error?.let { ErrorBox(it) }
                    BigButton(if (saved) "Tersimpan ✓" else "Simpan pengaturan", {
                        busy = true; error = null
                        scope.launch {
                            try {
                                app.api.saveCallSettings(CallSettingsInput(f.webrtc_enabled, f.call_availability, f.ring_timeout_seconds.coerceIn(15, 90), f.max_call_duration_seconds.coerceIn(60, 600), f.allow_anonymous_webrtc, f.quiet_hours, f.allow_urgent_alerts))
                                saved = true
                            } catch (e: ApiException) { error = e.fields.values.firstOrNull() ?: e.message } finally { busy = false }
                        }
                    }, loading = busy)
                }
            }
        }

        Panel(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Tentang", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("Server: ${app.session.serverUrl}", color = Muted, fontSize = 13.sp)
                Text("Versi ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", color = Muted, fontSize = 13.sp)
            }
        }
        BigButton("Keluar", { confirmLogout = true }, dark = false)
        Spacer(Modifier.height(24.dp))
    }

    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false }, title = { Text("Keluar?") },
        text = { Text("Anda tidak akan menerima panggilan di perangkat ini sampai masuk kembali.") },
        confirmButton = { TextButton(onClick = { scope.launch { runCatching { app.api.logout() }; app.onLoggedOut() } }) { Text("Keluar", color = CoralDeep) } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Batal") } },
    )
}

@Composable
private fun SwitchRow(title: String, desc: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold); Text(desc, color = Muted, fontSize = 13.sp) }
        Switch(checked = checked, onCheckedChange = onChange, colors = SwitchDefaults.colors(checkedTrackColor = Brand))
    }
}
