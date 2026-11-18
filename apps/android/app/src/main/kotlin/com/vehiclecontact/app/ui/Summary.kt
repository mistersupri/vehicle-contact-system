package com.vehiclecontact.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.Labels
import com.vehiclecontact.core.Report
import kotlinx.coroutines.delay
import java.time.LocalTime

private fun greeting(): String { val h = LocalTime.now().hour; return when { h < 11 -> "Selamat pagi"; h < 15 -> "Selamat siang"; h < 19 -> "Selamat sore"; else -> "Selamat malam" } }

@Composable
fun SummaryScreen(onReport: (String) -> Unit, onOpenReports: () -> Unit, onOpenCalls: () -> Unit) {
    val app = LocalContext.current.vecs
    val loader = rememberLoader { app.api.summary() }
    LaunchedEffect(Unit) { while (true) { delay(30_000); loader.reload() } }
    val name = (app.session.userName ?: "").substringBefore(' ')

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { ScreenTitle("${greeting()}, $name", "Ringkasan") }
        item { ReadinessCard() }
        item {
            loader.Content { s ->
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (s.vehicles.total == 0) Empty("Belum ada kendaraan", "Tambahkan kendaraan di tab Kendaraan untuk mendapatkan QR Code unik.")
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Stat("Laporan baru", s.reports["NEW"] ?: 0, "${(s.reports["NEW"] ?: 0) + (s.reports["READ"] ?: 0) + (s.reports["IN_PROGRESS"] ?: 0)} terbuka", Mint, Ink, Modifier.weight(1f).clickable(onClick = onOpenReports))
                        Stat("Kendaraan aktif", s.vehicles.active, "dari ${s.vehicles.total}", Ink, Color.White, Modifier.weight(1f))
                    }
                    Stat("Panggilan tak terjawab", s.calls.missed, "${s.calls.total} panggilan", Color.White, Ink, Modifier.fillMaxWidth().clickable(onClick = onOpenCalls))
                    Text("Laporan terbaru", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                    if (s.recent_reports.isEmpty()) Empty("Belum ada laporan", "Laporan dari pemindai QR akan muncul di sini.")
                    s.recent_reports.forEach { ReportRow(it, onReport) }
                }
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: Int, sub: String, bg: Color, fg: Color, modifier: Modifier) {
    Panel(color = bg, modifier = modifier) {
        Column(Modifier.padding(18.dp)) {
            Text(label, color = fg.copy(alpha = .6f), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text("$value", color = fg, fontSize = 52.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 6.dp))
            Text(sub, color = fg.copy(alpha = .6f), fontSize = 13.sp)
        }
    }
}

/** Laporan baru memakai kartu mint (seperti web); lainnya putih. */
@Composable
fun ReportRow(r: Report, onClick: (String) -> Unit) {
    Panel(color = if (r.status == "NEW") Mint else Color.White, modifier = Modifier.fillMaxWidth().clickable { onClick(r.id) }) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(Labels.category[r.category] ?: r.category, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                StatusPill(r.status, Labels.reportStatus[r.status] ?: r.status)
            }
            Spacer(Modifier.height(6.dp)); PlateBadge(r.plate_number)
            Spacer(Modifier.height(8.dp))
            Text(r.message, maxLines = 2, color = Ink.copy(alpha = .75f), fontSize = 14.sp)
            Spacer(Modifier.height(6.dp))
            Text(timeAgo(r.created_at) + if (r.photo_count > 0) "  ·  ${r.photo_count} foto" else "", color = if (r.status == "NEW") CoralDeep else Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
