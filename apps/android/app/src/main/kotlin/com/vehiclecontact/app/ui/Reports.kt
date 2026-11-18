package com.vehiclecontact.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import com.vehiclecontact.core.Labels
import kotlinx.coroutines.launch

private val FILTERS = listOf("" to "Aktif", "NEW" to "Baru", "IN_PROGRESS" to "Diproses", "RESOLVED" to "Selesai", "ARCHIVED" to "Arsip")

@Composable
fun ReportsScreen(onReport: (String) -> Unit) {
    val app = LocalContext.current.vecs
    var filter by rememberSaveable { mutableStateOf("") }
    val loader = rememberLoader(filter) { app.api.reports(status = filter.ifEmpty { null }) }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        ScreenTitle("Pesan dari pemindai QR", "Laporan")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 12.dp)) {
            items(FILTERS) { (code, label) ->
                FilterChip(selected = filter == code, onClick = { filter = code }, label = { Text(label) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Ink, selectedLabelColor = Color.White))
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
            item {
                loader.Content { r ->
                    if (r.reports.isEmpty()) Empty("Tidak ada laporan", "Laporan dari pemindai QR kendaraan Anda akan muncul di sini.")
                }
            }
            val ui = loader.ui
            if (ui is Ui.Ok) items(ui.value.reports, key = { it.id }) { ReportRow(it, onReport) }
        }
    }
}

@Composable
fun ReportDetailScreen(id: String) {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    val loader = rememberLoader(id) { app.api.report(id) }
    val history = rememberLoader(id) { app.api.reportHistory(id) }
    var note by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var photo by remember { mutableStateOf<String?>(null) }

    fun setStatus(status: String) {
        busy = true; error = null
        scope.launch {
            try { app.api.setReportStatus(id, status, note.ifBlank { null }); note = ""; loader.reload(); history.reload() }
            catch (e: ApiException) { error = e.message } finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        loader.Content { r ->
            Panel(color = Ink, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp)) {
                    Row { StatusPill(r.status, Labels.reportStatus[r.status] ?: r.status); Spacer(Modifier.weight(1f)); Text(r.reference, color = Color.White.copy(alpha = .5f), fontSize = 11.sp) }
                    Spacer(Modifier.height(12.dp))
                    Text(Labels.category[r.category] ?: r.category, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp)); PlateBadge(r.plate_number)
                    Spacer(Modifier.height(8.dp)); Text(fmtDateTime(r.created_at), color = Color.White.copy(alpha = .6f), fontSize = 13.sp)
                }
            }
            Panel(modifier = Modifier.fillMaxWidth()) { Text(r.message, fontSize = 17.sp, modifier = Modifier.padding(18.dp)) }

            if (r.attachments.isNotEmpty()) Panel(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Foto (${r.attachments.size})", color = Muted, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(r.attachments, key = { it.id }) { a ->
                            AsyncImage(
                                model = app.api.url("/attachments/${a.id}?thumb=1"), imageLoader = app.imageLoader, contentDescription = "Lampiran laporan",
                                contentScale = ContentScale.Crop, modifier = Modifier.size(110.dp).clip(RoundedCornerShape(16.dp)).clickable { photo = a.id },
                            )
                        }
                    }
                }
            }
            Panel(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Pelapor", color = Muted, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Spacer(Modifier.height(6.dp))
                    Text(r.reporter_name ?: "Anonim", fontWeight = FontWeight.SemiBold)
                    Text(r.reporter_phone ?: "Nomor tidak dicantumkan", color = Muted)
                }
            }
            if (r.status != "ARCHIVED") Panel(color = Mint, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Tindak lanjut", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Spacer(Modifier.height(8.dp))
                    FormField("Catatan (opsional)", note, { note = it }, singleLine = false, minLines = 2)
                    error?.let { Spacer(Modifier.height(8.dp)); ErrorBox(it) }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (r.status != "IN_PROGRESS") SmallButton("Sedang ditangani", { setStatus("IN_PROGRESS") }, enabled = !busy)
                        if (r.status != "RESOLVED") SmallButton("Selesai", { setStatus("RESOLVED") }, dark = true, enabled = !busy)
                        SmallButton("Arsipkan", { setStatus("ARCHIVED") }, enabled = !busy)
                    }
                }
            }
        }
        Text("Riwayat status", fontWeight = FontWeight.Bold, fontSize = 17.sp)
        history.Content { items ->
            Panel(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items.forEach { h ->
                        Column {
                            Text((Labels.reportStatus[h.new_status] ?: h.new_status) + (h.old_status?.let { " ← ${Labels.reportStatus[it] ?: it}" } ?: ""), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text(fmtDateTime(h.created_at) + if (h.system == 1) " · sistem" else "", color = Muted, fontSize = 12.sp)
                            h.note?.let { Text("“$it”", color = Muted, fontSize = 13.sp) }
                        }
                    }
                }
            }
        }
    }
    photo?.let { pid ->
        Dialog(onDismissRequest = { photo = null }) {
            AsyncImage(model = app.api.url("/attachments/$pid"), imageLoader = app.imageLoader, contentDescription = "Foto laporan", modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).clickable { photo = null })
        }
    }
}
