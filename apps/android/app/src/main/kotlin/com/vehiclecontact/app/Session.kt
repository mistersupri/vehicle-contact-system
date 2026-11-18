package com.vehiclecontact.app

import android.content.Context
import com.vehiclecontact.core.CookieStorage

/** Pengaturan lokal (SharedPreferences privat aplikasi). Cookie sesi disimpan di sini agar login bertahan. */
class Session(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("vecs", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server", null) ?: BuildConfig.DEFAULT_SERVER_URL
        set(v) { prefs.edit().putString("server", v).apply() }
    var userName: String?
        get() = prefs.getString("name", null)
        set(v) { prefs.edit().putString("name", v).apply() }
    var userEmail: String?
        get() = prefs.getString("email", null)
        set(v) { prefs.edit().putString("email", v).apply() }
    /** Pemilik dapat mematikan mode siaga (tidak ada notifikasi permanen, tapi panggilan hanya berdering saat aplikasi terbuka). */
    var listenEnabled: Boolean
        get() = prefs.getBoolean("listen", true)
        set(v) { prefs.edit().putBoolean("listen", v).apply() }

    val cookieStorage = object : CookieStorage {
        override fun load(): String? = prefs.getString("cookies", null)
        override fun save(data: String) { prefs.edit().putString("cookies", data).apply() }
    }

    fun clearUser() { prefs.edit().remove("name").remove("email").remove("cookies").apply() }
}
