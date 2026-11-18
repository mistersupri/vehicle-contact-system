package com.vehiclecontact.app

import android.app.Application
import android.content.Context
import coil.ImageLoader
import com.vehiclecontact.app.call.CallEngine
import com.vehiclecontact.app.call.CallService
import com.vehiclecontact.app.call.NotificationHelper
import com.vehiclecontact.core.ApiClient
import com.vehiclecontact.core.User
import com.vehiclecontact.core.VcsCookieJar
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class VecsApp : Application() {
    lateinit var session: Session
    lateinit var cookieJar: VcsCookieJar
    lateinit var http: OkHttpClient
    lateinit var wsClient: OkHttpClient
    lateinit var api: ApiClient
    lateinit var engine: CallEngine
    lateinit var imageLoader: ImageLoader

    private val _loggedIn = MutableStateFlow(false)
    val loggedIn: StateFlow<Boolean> get() = _loggedIn

    override fun onCreate() {
        super.onCreate()
        session = Session(this)
        cookieJar = VcsCookieJar(session.cookieStorage)
        http = OkHttpClient.Builder().cookieJar(cookieJar)
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS).build()
        // WebSocket: tanpa batas baca; ping tiap 25 dtk menjaga koneksi di balik Cloudflare/NAT dan mendeteksi putus
        wsClient = http.newBuilder().readTimeout(0, TimeUnit.SECONDS).pingInterval(25, TimeUnit.SECONDS).build()
        api = ApiClient(session.serverUrl, http)
        imageLoader = ImageLoader.Builder(this).okHttpClient(http).build()
        engine = CallEngine(this)
        NotificationHelper.createChannels(this)
        _loggedIn.value = cookieJar.hasSession() && session.userEmail != null
        if (_loggedIn.value && session.listenEnabled) CallService.start(this)
    }

    fun setServer(url: String) { session.serverUrl = url; api.baseUrl = url }

    fun onLoggedIn(user: User) {
        session.userName = user.name; session.userEmail = user.email
        _loggedIn.value = true
        if (session.listenEnabled) CallService.start(this)
    }

    /** Dipanggil saat server menolak sesi (401) atau pengguna keluar. */
    fun onLoggedOut() {
        cookieJar.clear(); session.clearUser()
        _loggedIn.value = false
        CallService.stop(this)
    }
}

val Context.vecs: VecsApp get() = applicationContext as VecsApp
