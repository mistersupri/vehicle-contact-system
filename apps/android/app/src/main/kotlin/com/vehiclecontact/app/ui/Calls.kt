package com.vehiclecontact.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vehiclecontact.app.call.Conn
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.CallState
import com.vehiclecontact.core.Labels
import kotlinx.coroutines.delay

@Composable
fun CallsScreen() {
    val app = LocalContext.current.vecs
    var missedOnly by rememberSaveable { mutableStateOf(false) }
    val loader = rememberLoader(missedOnly) { app.api.calls(missedOnly) }
    val conn by app.engine.connection.collectAsStateWithLifecycle()
    val state by app.engine.state.collectAsStateWithLifecycle()
    LaunchedEffect(state) { if (state is CallState.Idle || state is CallState.Ended) loader.reload() }
    LaunchedEffect(Unit) { while (true) { delay(15_000); loader.reload() } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { ScreenTitle("Panggilan dari pemindai QR", "Panggilan") }
        item {
            Panel(color = if (conn == Conn.ONLINE) Mint else Color.White, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(when (conn) { Conn.ONLINE -> "Anda online — siap menerima panggilan"; Conn.CONNECTING -> "Menyambungkan…"; Conn.OFFLINE -> "Anda sedang offline" }, fontWeight = FontWeight.Bold)
                    Text(if (conn == Conn.ONLINE) "Panggilan berdering layar penuh walau aplikasi ditutup, selama notifikasi \"Siap menerima panggilan\" aktif."
                    else "Panggilan tidak akan berdering sampai koneksi pulih.", color = Ink.copy(alpha = .6f), fontSize = 13.sp)
                }
            }
        }
        item { ReadinessCard() }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !missedOnly, onClick = { missedOnly = false }, label = { Text("Semua") }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Brand, selectedLabelColor = Color.White))
                FilterChip(selected = missedOnly, onClick = { missedOnly = true }, label = { Text("Tak terjawab") }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Brand, selectedLabelColor = Color.White))
            }
        }
        item { loader.Content { c -> if (c.isEmpty()) Empty(if (missedOnly) "Tidak ada panggilan tak terjawab" else "Belum ada panggilan", "Riwayat panggilan beserta durasinya akan tampil di sini.") } }
        val ui = loader.ui
        if (ui is Ui.Ok) items(ui.value, key = { it.id }) { c ->
            Panel(color = if (c.status == "MISSED") CoralSoft else Color.White, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${c.plate_number}  ·  ${if (c.call_type == "PSTN") "Telepon biasa" else "Internet"}", fontWeight = FontWeight.Bold)
                        Text(timeAgo(c.started_at) + " · " + (if (c.duration_seconds != null) "durasi ${fmtDuration(c.duration_seconds)}" else when (c.end_reason) { "timeout" -> "tidak dijawab"; "caller_cancelled" -> "dibatalkan penelepon"; else -> "—" }), color = Muted, fontSize = 13.sp)
                    }
                    StatusPill(c.status, Labels.callStatus[c.status] ?: c.status)
                }
            }
        }
    }
}
