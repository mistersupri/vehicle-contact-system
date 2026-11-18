package com.vehiclecontact.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import com.vehiclecontact.core.Channel
import kotlinx.coroutines.launch

private val DSTATUS = mapOf("PENDING" to "Menunggu", "PROCESSING" to "Diproses", "SENT" to "Terkirim", "FAILED" to "Gagal", "RETRY_SCHEDULED" to "Dicoba ulang")
private val KIND = mapOf("report.created" to "Laporan baru", "call.missed" to "Panggilan tak terjawab", "report.urgent" to "Notifikasi mendesak", "test" to "Tes")

@Composable
fun NotificationsScreen() {
    val ctx = LocalContext.current
    val app = ctx.vecs
    val scope = rememberCoroutineScope()
    val channels = rememberLoader { app.api.channels() }
    val deliveries = rememberLoader { app.api.deliveries() }
    var msg by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tgToken by remember { mutableStateOf<String?>(null) }
    var phone by remember { mutableStateOf("+62") }
    var code by remember { mutableStateOf("") }
    var waDevCode by remember { mutableStateOf<String?>(null) }
    var waStep by remember { mutableStateOf(false) }

    fun act(ok: String? = null, block: suspend () -> Unit) {
        error = null
        scope.launch { try { block(); if (ok != null) msg = ok; channels.reload(); deliveries.reload() } catch (e: ApiException) { error = e.fields.values.firstOrNull() ?: e.message } }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Notice("Laporan baru dan panggilan tak terjawab dikirim ke semua kanal aktif. Jika satu kanal gagal, kanal lain tetap terkirim dan pengiriman dicoba ulang otomatis.", Sky, SkyDeep)
        msg?.let { Notice(it) }
        error?.let { ErrorBox(it) }
        channels.Content { c ->
            val tg = c.channels.firstOrNull { it.channel == "TELEGRAM" }
            val wa = c.channels.firstOrNull { it.channel == "WHATSAPP" }

            ChannelCard("Telegram", tg, !c.providers.telegram_live, onToggle = { v -> act { app.api.setChannelEnabled(tg!!.id, v) } }, onTest = { act("Pesan tes dikirim.") { app.api.testChannel("TELEGRAM") } }) {
                if (tg == null) {
                    if (tgToken == null) {
                        Text("Hubungkan lewat bot. Anda harus memulai percakapan dengan bot terlebih dahulu.", color = Muted, fontSize = 14.sp)
                        Spacer(Modifier.height(8.dp))
                        SmallButton("Hubungkan Telegram", { act { val r = app.api.telegramConnect(); tgToken = r.dev_token ?: "link"; r.deep_link?.let { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } } }, dark = true)
                    } else {
                        Notice("Token berlaku 15 menit dan hanya sekali pakai. Setelah mengirim /start ke bot, muat ulang halaman ini.", Mint, MintDeep)
                        Spacer(Modifier.height(8.dp)); SmallButton("Saya sudah kirim /start", { tgToken = null; channels.reload() })
                    }
                } else { Text("Terhubung ✓", color = MintDeep); SmallButton("Putuskan", { act { app.api.telegramDisconnect() } }) }
            }

            val em = c.channels.firstOrNull { it.channel == "EMAIL" }
            ChannelCard("Email", em, !c.providers.email_live, onToggle = { v -> act { app.api.setEmailChannel(v) } }, onTest = { act("Pesan tes dikirim.") { app.api.testChannel("EMAIL") } }) {
                if (em == null) {
                    Text("Notifikasi dikirim ke alamat email akun Anda.", color = Muted, fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp)); SmallButton("Aktifkan Email", { act { app.api.setEmailChannel(true) } }, dark = true)
                } else Text("Aktif ✓", color = MintDeep, fontSize = 14.sp)
            }

            ChannelCard("WhatsApp", wa, !c.providers.whatsapp_live, onToggle = { v -> act { app.api.setChannelEnabled(wa!!.id, v) } }, onTest = { act("Pesan tes dikirim.") { app.api.testChannel("WHATSAPP") } }) {
                if (wa == null) {
                    if (!waStep) {
                        FormField("Nomor WhatsApp", phone, { phone = it }, keyboard = KeyboardType.Phone, hint = "Format internasional. Kode verifikasi dikirim ke nomor ini.")
                        Spacer(Modifier.height(8.dp)); SmallButton("Kirim kode verifikasi", { act { waDevCode = app.api.whatsappConnect(phone.replace(" ", "").replace("-", "")).dev_code; waStep = true } }, dark = true)
                    } else {
                        FormField("Kode 6 digit", code, { code = it.filter(Char::isDigit).take(6) }, keyboard = KeyboardType.Number)
                        waDevCode?.let { Text("Mode demo — kode: $it", color = AmberDeep, fontSize = 13.sp) }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SmallButton("Verifikasi", { act("WhatsApp terhubung.") { app.api.whatsappVerify(code); waStep = false; code = "" } }, dark = true, enabled = code.length == 6)
                            SmallButton("Ganti nomor", { waStep = false })
                        }
                    }
                } else Text("Terhubung ✓ — hanya untuk menerima notifikasi (satu arah).", color = MintDeep, fontSize = 14.sp)
            }
        }
        Text("Riwayat pengiriman", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        deliveries.Content { list ->
            Panel(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (list.isEmpty()) Text("Belum ada pengiriman. Kirim tes untuk mencoba.", color = Muted)
                    list.forEach { d ->
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text((KIND[d.kind] ?: d.kind) + (d.plate?.let { " · $it" } ?: ""), fontWeight = FontWeight.SemiBold)
                                Text((when (d.channel) { "TELEGRAM" -> "Telegram"; "EMAIL" -> "Email"; else -> "WhatsApp" }) + " · " + timeAgo(d.created_at) + (if (d.attempts > 1) " · ${d.attempts} percobaan" else ""), color = Muted, fontSize = 12.sp)
                            }
                            StatusPill(d.status, DSTATUS[d.status] ?: d.status)
                        }
                    }
                }
            }
        }
        Text("“Terkirim” berarti provider menerima pesan, bukan jaminan sudah dibaca.", color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun ChannelCard(title: String, channel: Channel?, simulated: Boolean, onToggle: (Boolean) -> Unit, onTest: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text(channel?.destination_masked ?: "Belum terhubung", color = Muted, fontSize = 13.sp) }
                if (channel != null) Switch(checked = channel.enabled, onCheckedChange = onToggle, colors = SwitchDefaults.colors(checkedTrackColor = Brand))
            }
            if (simulated) { Spacer(Modifier.height(8.dp)); Pill("Mode simulasi — belum ada kredensial provider", Amber, AmberDeep) }
            Spacer(Modifier.height(12.dp))
            content()
            if (channel != null) { Spacer(Modifier.height(8.dp)); SmallButton("Kirim tes", onTest) }
        }
    }
}
