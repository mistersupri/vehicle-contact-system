package com.vehiclecontact.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// ---------- Pemuatan data ----------
sealed interface Ui<out T> {
    data object Loading : Ui<Nothing>
    data class Ok<T>(val value: T) : Ui<T>
    data class Err(val message: String) : Ui<Nothing>
}

class Loader<T>(private val scope: CoroutineScope, private val onAuthFailed: () -> Unit, private val block: suspend () -> T) {
    var ui by mutableStateOf<Ui<T>>(Ui.Loading)
        private set

    fun reload() {
        scope.launch {
            if (ui !is Ui.Ok) ui = Ui.Loading
            try {
                ui = Ui.Ok(block())
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException) {
                if (e.isUnauthorized) onAuthFailed() else if (ui !is Ui.Ok) ui = Ui.Err(e.message ?: "Gagal memuat")
            } catch (e: Exception) {
                if (ui !is Ui.Ok) ui = Ui.Err("Gagal memuat data")
            }
        }
    }
}

@Composable
fun <T> rememberLoader(vararg keys: Any?, block: suspend () -> T): Loader<T> {
    val scope = rememberCoroutineScope()
    val app = LocalContext.current.vecs
    val loader = remember(*keys) { Loader(scope, { app.onLoggedOut() }, block) }
    LaunchedEffect(loader) { loader.reload() }
    return loader
}

@Composable
fun <T> Loader<T>.Content(content: @Composable (T) -> Unit) {
    when (val u = ui) {
        Ui.Loading -> Loading()
        is Ui.Err -> ErrorBox(u.message) { reload() }
        is Ui.Ok -> content(u.value)
    }
}

// ---------- Komponen ----------
@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Ink, strokeWidth = 3.dp) }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)? = null) {
    Panel(color = CoralSoft, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(message, color = CoralDeep, fontWeight = FontWeight.Medium)
            if (onRetry != null) { Spacer(Modifier.height(8.dp)); TextButton(onClick = onRetry) { Text("Coba lagi", color = CoralDeep) } }
        }
    }
}

@Composable
fun Notice(text: String, bg: Color = Mint, fg: Color = MintDeep, modifier: Modifier = Modifier) {
    Panel(color = bg, modifier = modifier.fillMaxWidth()) { Text(text, color = fg, modifier = Modifier.padding(14.dp), fontSize = 14.sp, fontWeight = FontWeight.Medium) }
}

@Composable
fun Panel(modifier: Modifier = Modifier, color: Color = Color.White, radius: Dp = 24.dp, content: @Composable () -> Unit) {
    Surface(modifier = modifier, shape = RoundedCornerShape(radius), color = color, content = content)
}

@Composable
fun Pill(text: String, bg: Color, fg: Color) {
    Box(Modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 4.dp)) { Text(text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
}

/** Status tidak hanya dibedakan lewat warna: selalu ada label teks. */
@Composable
fun StatusPill(status: String, label: String) {
    val (bg, fg) = when (status) {
        "NEW", "MISSED", "FAILED", "SUSPENDED" -> CoralSoft to CoralDeep
        "READ", "ACCEPTED", "PROCESSING" -> Sky to SkyDeep
        "IN_PROGRESS", "RINGING", "RETRY_SCHEDULED", "PENDING" -> Amber to AmberDeep
        "RESOLVED", "COMPLETED", "ACTIVE", "SENT" -> Mint to MintDeep
        else -> Color(0x14101011) to Ink
    }
    Pill("● $label", bg, fg)
}

@Composable
fun BigButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false, dark: Boolean = true) {
    Button(
        onClick = onClick, enabled = enabled && !loading, modifier = modifier.fillMaxWidth().height(52.dp), shape = CircleShape,
        colors = if (dark) ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Color.White)
        else ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Ink),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = if (dark) Color.White else Ink, strokeWidth = 2.dp)
        else Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
    }
}

@Composable
fun SmallButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, dark: Boolean = false, enabled: Boolean = true) {
    Button(
        onClick = onClick, enabled = enabled, modifier = modifier.height(40.dp), shape = CircleShape, contentPadding = PaddingValues(horizontal = 16.dp),
        colors = if (dark) ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Color.White) else ButtonDefaults.buttonColors(containerColor = Color(0x14101011), contentColor = Ink),
    ) { Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun FormField(
    label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier,
    keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false, error: String? = null, hint: String? = null, singleLine: Boolean = true, minLines: Int = 1,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, modifier = modifier.fillMaxWidth(), label = { Text(label) },
        singleLine = singleLine, minLines = minLines, isError = error != null, shape = RoundedCornerShape(18.dp),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
        supportingText = (error ?: hint)?.let { t -> { Text(t) } },
        colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White, focusedBorderColor = Ink, focusedLabelColor = Ink),
    )
}

@Composable
fun Empty(title: String, body: String) {
    Panel(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(28.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 18.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(body, color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun ScreenTitle(eyebrow: String?, title: String) {
    Column(Modifier.padding(bottom = 12.dp)) {
        if (eyebrow != null) Text(eyebrow, color = Muted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Text(title, fontSize = 32.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.5).sp)
    }
}

// ---------- Format ----------
private val idLocale = Locale("id", "ID")
private val dateTimeFmt = DateTimeFormatter.ofPattern("d MMM yyyy HH:mm", idLocale).withZone(ZoneId.systemDefault())

fun parseInstant(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull()

fun timeAgo(iso: String): String {
    val t = parseInstant(iso) ?: return iso
    val s = Duration.between(t, Instant.now()).seconds
    return when {
        s < 45 -> "baru saja"
        s < 3600 -> "${s / 60 + (if (s % 60 >= 30) 1 else 0)} menit lalu"
        s < 86400 -> "${s / 3600} jam lalu"
        s < 86400 * 7 -> "${s / 86400} hari lalu"
        else -> fmtDateTime(iso)
    }
}
fun fmtDateTime(iso: String): String = parseInstant(iso)?.let { dateTimeFmt.format(it) } ?: iso
fun fmtDuration(sec: Int?): String = if (sec == null) "-" else "%d:%02d".format(sec / 60, sec % 60)
