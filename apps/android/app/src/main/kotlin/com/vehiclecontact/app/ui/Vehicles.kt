package com.vehiclecontact.app.ui

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import com.vehiclecontact.core.Labels
import com.vehiclecontact.core.Vehicle
import com.vehiclecontact.core.VehicleInput
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private val TYPES = listOf("Mobil", "Motor", "Truk", "Bus", "Lainnya")

@Composable
fun VehiclesScreen() {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    val loader = rememberLoader { app.api.vehicles() }
    var editing by remember { mutableStateOf<Vehicle?>(null) }
    var creating by remember { mutableStateOf(false) }
    var qrFor by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Vehicle?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { ScreenTitle("Satu akun, banyak kendaraan", "Kendaraan") }
            error?.let { e -> item { ErrorBox(e) } }
            item { loader.Content { v -> if (v.isEmpty()) Empty("Belum ada kendaraan", "Tambahkan kendaraan pertama Anda untuk mendapatkan QR Code unik.") } }
            val ui = loader.ui
            if (ui is Ui.Ok) items(ui.value, key = { it.id }) { v ->
                Panel(color = if (v.status == "ACTIVE") Color.White else Color(0xFFF4F4F2), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { PlateBadge(v.plate_number); Spacer(Modifier.weight(1f)); StatusPill(v.status, Labels.vehicleStatus[v.status] ?: v.status) }
                        Spacer(Modifier.height(10.dp))
                        Text(listOfNotNull(v.brand, v.model).joinToString(" ").ifEmpty { v.vehicle_type }, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(listOfNotNull(v.vehicle_type, v.color).joinToString(" · ") + " · tampil sebagai “${v.owner_display_name}”", color = Muted, fontSize = 13.sp)
                        Spacer(Modifier.height(6.dp))
                        if (v.new_report_count > 0) Pill("${v.new_report_count} laporan baru", CoralSoft, CoralDeep) else Pill("${v.report_count} laporan", Color(0x14101011), Ink)
                        if (v.qr == null) { Spacer(Modifier.height(4.dp)); Pill("QR dicabut", Amber, AmberDeep) }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SmallButton("QR Code", { qrFor = v.id }, dark = true)
                            SmallButton("Ubah", { editing = v })
                            if (v.status != "SUSPENDED") SmallButton(if (v.status == "ACTIVE") "Nonaktifkan" else "Aktifkan", {
                                scope.launch { try { app.api.setVehicleActive(v.id, v.status != "ACTIVE"); loader.reload() } catch (e: ApiException) { error = e.message } }
                            })
                            SmallButton("Hapus", { deleting = v })
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = { creating = true }, modifier = Modifier.align(androidx.compose.ui.Alignment.BottomEnd).padding(20.dp), containerColor = Ink, contentColor = Color.White) {
            Icon(Icons.Default.Add, contentDescription = "Tambah kendaraan")
        }
    }

    if (creating || editing != null) VehicleDialog(editing, onDismiss = { creating = false; editing = null }, onSaved = { created ->
        creating = false; editing = null; loader.reload(); if (created != null) qrFor = created
    })
    qrFor?.let { id ->
        val uiNow = loader.ui
        val v = if (uiNow is Ui.Ok) uiNow.value.firstOrNull { it.id == id } else null
        if (v != null) QrSheet(v, onDismiss = { qrFor = null }, onChanged = { loader.reload() })
    }
    deleting?.let { v ->
        AlertDialog(
            onDismissRequest = { deleting = null }, title = { Text("Hapus kendaraan?") },
            text = { Text("QR akan dicabut dan kendaraan tidak lagi menerima laporan atau panggilan. Riwayat laporan lama tetap tersimpan.") },
            confirmButton = { TextButton(onClick = { scope.launch { try { app.api.deleteVehicle(v.id); loader.reload() } catch (e: ApiException) { error = e.message }; deleting = null } }) { Text("Hapus", color = CoralDeep) } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Batal") } },
        )
    }
}

@Composable
private fun VehicleDialog(vehicle: Vehicle?, onDismiss: () -> Unit, onSaved: (createdId: String?) -> Unit) {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    var plate by remember { mutableStateOf(vehicle?.plate_number ?: "") }
    var type by remember { mutableStateOf(vehicle?.vehicle_type ?: "Mobil") }
    var brand by remember { mutableStateOf(vehicle?.brand ?: "") }
    var model by remember { mutableStateOf(vehicle?.model ?: "") }
    var color by remember { mutableStateOf(vehicle?.color ?: "") }
    var display by remember { mutableStateOf(vehicle?.owner_display_name ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (vehicle == null) "Tambah kendaraan" else "Ubah kendaraan") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FormField("Pelat nomor", plate, { plate = it.uppercase() })
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    TYPES.forEach { t -> FilterChip(selected = type == t, onClick = { type = t }, label = { Text(t) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Ink, selectedLabelColor = Color.White)) }
                }
                FormField("Merek", brand, { brand = it }); FormField("Model", model, { model = it }); FormField("Warna", color, { color = it })
                FormField("Nama yang tampil ke publik", display, { display = it }, hint = "Cukup nama panggilan, mis. “Budi S.”. Jangan isi nomor telepon.")
                error?.let { ErrorBox(it) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && plate.length >= 2 && display.length >= 2, onClick = {
                busy = true; error = null
                val input = VehicleInput(plate.trim(), type, brand.ifBlank { null }, model.ifBlank { null }, color.ifBlank { null }, display.trim())
                scope.launch {
                    try { if (vehicle == null) onSaved(app.api.createVehicle(input).id) else { app.api.updateVehicle(vehicle.id, input); onSaved(null) } }
                    catch (e: ApiException) { error = e.fields.values.firstOrNull() ?: e.message } finally { busy = false }
                }
            }) { Text(if (vehicle == null) "Tambah & buat QR" else "Simpan", fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QrSheet(v: Vehicle, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val ctx = LocalContext.current
    val app = ctx.vecs
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) } // "regen" | "revoke"

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Paper) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 32.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
            if (v.qr != null) {
                Panel(modifier = Modifier.fillMaxWidth(0.85f)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                        Text("Pindai untuk menghubungi pemilik", color = Muted, fontSize = 13.sp)
                        AsyncImage(model = app.api.url("/vehicles/${v.id}/qr?format=png&r=${v.qr!!.id}"), imageLoader = app.imageLoader, contentDescription = "QR Code ${v.plate_number}", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth().aspectRatio(1f))
                        PlateBadge(v.plate_number)
                    }
                }
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmallButton("Bagikan PNG", {
                        scope.launch {
                            try {
                                val bytes = app.api.qrPng(v.id)
                                val f = withContext(Dispatchers.IO) { File(ctx.cacheDir, "shared").apply { mkdirs() }.let { File(it, "qr-${v.plate_number.filter { c -> c.isLetterOrDigit() }}.png").apply { writeBytes(bytes) } } }
                                val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Bagikan QR"))
                            } catch (e: Exception) { error = (e as? ApiException)?.message ?: "Gagal membagikan QR" }
                        }
                    }, dark = true)
                    SmallButton("Bagikan tautan", { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, v.qr!!.public_url), "Bagikan tautan")) })
                }
                Spacer(Modifier.height(12.dp))
                Notice("Cetak pada bahan tahan air dan tempel di kaca atau bodi. Jika QR tersalin atau disalahgunakan, ganti kapan saja — QR lama langsung tidak berlaku.", Sky, SkyDeep)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { SmallButton("Ganti QR", { confirm = "regen" }); SmallButton("Cabut QR", { confirm = "revoke" }) }
            } else {
                Text("QR untuk kendaraan ini telah dicabut.", color = Muted)
                Spacer(Modifier.height(12.dp))
                BigButton("Buat QR baru", { scope.launch { try { app.api.regenerateQr(v.id); onChanged() } catch (e: ApiException) { error = e.message } } })
            }
            error?.let { Spacer(Modifier.height(8.dp)); ErrorBox(it) }
        }
    }
    confirm?.let { c ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text(if (c == "regen") "Ganti QR Code?" else "Cabut QR Code?") },
            text = { Text(if (c == "regen") "QR lama akan langsung tidak berlaku. Anda perlu mencetak dan menempel QR yang baru." else "Kendaraan tidak akan bisa dihubungi sampai Anda membuat QR baru.") },
            confirmButton = { TextButton(onClick = { scope.launch { try { if (c == "regen") app.api.regenerateQr(v.id) else app.api.revokeQr(v.id); onChanged() } catch (e: ApiException) { error = e.message }; confirm = null } }) { Text(if (c == "regen") "Ganti" else "Cabut", color = CoralDeep) } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Batal") } },
        )
    }
}
