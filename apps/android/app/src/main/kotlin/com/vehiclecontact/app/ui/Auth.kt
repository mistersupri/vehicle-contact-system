package com.vehiclecontact.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.ApiException
import com.vehiclecontact.core.normalizeServerUrl
import kotlinx.coroutines.launch

private enum class AuthMode { LOGIN, REGISTER, FORGOT }

@Composable
fun AuthScreens() {
    var mode by rememberSaveable { mutableStateOf(AuthMode.LOGIN) }
    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Vehicle", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text("Contact", fontSize = 18.sp, color = Muted)
        Spacer(Modifier.height(28.dp))
        when (mode) {
            AuthMode.LOGIN -> LoginForm(onRegister = { mode = AuthMode.REGISTER }, onForgot = { mode = AuthMode.FORGOT })
            AuthMode.REGISTER -> RegisterForm(onBack = { mode = AuthMode.LOGIN })
            AuthMode.FORGOT -> ForgotForm(onBack = { mode = AuthMode.LOGIN })
        }
    }
}

@Composable
private fun LoginForm(onRegister: () -> Unit, onForgot: () -> Unit) {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var server by rememberSaveable { mutableStateOf(app.session.serverUrl) }
    var showServer by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val url = normalizeServerUrl(server)
        if (url == null) { error = "Alamat server tidak valid"; return }
        busy = true; error = null
        scope.launch {
            try {
                app.setServer(url)
                val r = app.api.login(email.trim(), pass)
                val user = r.user
                if (r.mfa_required || user == null) error = "Akun administrator dikelola lewat situs web (butuh MFA)." else app.onLoggedIn(user)
            } catch (e: ApiException) { error = e.message } finally { busy = false }
        }
    }

    Text("Selamat datang kembali", fontSize = 32.sp, fontWeight = FontWeight.SemiBold, lineHeight = 36.sp)
    Spacer(Modifier.height(6.dp)); Text("Masuk untuk mengelola kendaraan dan menerima panggilan.", color = Muted)
    Spacer(Modifier.height(24.dp))
    FormField("Email", email, { email = it }, keyboard = KeyboardType.Email)
    Spacer(Modifier.height(12.dp))
    FormField("Kata sandi", pass, { pass = it }, password = true)
    if (showServer) { Spacer(Modifier.height(12.dp)); FormField("Alamat server", server, { server = it }, keyboard = KeyboardType.Uri, hint = "Contoh: https://vecs.kukode.in") }
    error?.let { Spacer(Modifier.height(12.dp)); ErrorBox(it) }
    Spacer(Modifier.height(20.dp))
    BigButton("Masuk", ::submit, loading = busy, enabled = email.isNotBlank() && pass.isNotEmpty())
    Spacer(Modifier.height(8.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onForgot) { Text("Lupa kata sandi?", color = Brand) }
        TextButton(onClick = onRegister) { Text("Daftar", color = Brand, fontWeight = FontWeight.Bold) }
    }
    TextButton(onClick = { showServer = !showServer }) { Text(if (showServer) "Sembunyikan server" else "Server: ${app.session.serverUrl}", color = Muted, fontSize = 12.sp) }
}

@Composable
private fun RegisterForm(onBack: () -> Unit) {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf<Boolean?>(null) } // true = email terkirim

    Text("Buat akun", fontSize = 32.sp, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(20.dp))
    if (done != null) {
        if (done == true) Notice("Kami mengirim tautan verifikasi ke ${email.trim()}. Klik tautan itu, lalu masuk. Tidak ada? Periksa folder spam.")
        else Notice("Akun dibuat, tetapi server belum dapat mengirim email verifikasi. Hubungi administrator untuk mengaktifkan akun Anda.", Amber, AmberDeep)
        Spacer(Modifier.height(16.dp)); BigButton("Ke halaman masuk", onBack)
        return
    }
    FormField("Nama lengkap", name, { name = it })
    Spacer(Modifier.height(12.dp))
    FormField("Email", email, { email = it }, keyboard = KeyboardType.Email)
    Spacer(Modifier.height(12.dp))
    FormField("Kata sandi", pass, { pass = it }, password = true, hint = "Minimal 10 karakter, kombinasi huruf dan angka")
    error?.let { Spacer(Modifier.height(12.dp)); ErrorBox(it) }
    Spacer(Modifier.height(20.dp))
    BigButton("Daftar", {
        busy = true; error = null
        scope.launch {
            try { done = app.api.register(name.trim(), email.trim(), pass).email_sent }
            catch (e: ApiException) { error = e.fields.values.firstOrNull() ?: e.message } finally { busy = false }
        }
    }, loading = busy, enabled = name.isNotBlank() && email.isNotBlank() && pass.length >= 10)
    TextButton(onClick = onBack) { Text("Sudah punya akun? Masuk", color = Ink) }
}

@Composable
private fun ForgotForm(onBack: () -> Unit) {
    val app = LocalContext.current.vecs
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Text("Lupa kata sandi", fontSize = 32.sp, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(6.dp)); Text("Kami akan mengirim tautan untuk mengatur ulang kata sandi.", color = Muted)
    Spacer(Modifier.height(20.dp))
    if (sent) Notice("Jika email terdaftar, tautan reset telah dikirim. Periksa kotak masuk Anda.") else {
        FormField("Email", email, { email = it }, keyboard = KeyboardType.Email)
        error?.let { Spacer(Modifier.height(12.dp)); ErrorBox(it) }
        Spacer(Modifier.height(20.dp))
        BigButton("Kirim tautan reset", {
            busy = true; error = null
            scope.launch { try { app.api.forgotPassword(email.trim()); sent = true } catch (e: ApiException) { error = e.message } finally { busy = false } }
        }, loading = busy, enabled = email.isNotBlank())
    }
    TextButton(onClick = onBack) { Text("Kembali ke masuk", color = Ink) }
}
