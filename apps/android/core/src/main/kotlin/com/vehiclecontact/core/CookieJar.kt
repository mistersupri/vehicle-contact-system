package com.vehiclecontact.core

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/** Penyimpanan kunci-nilai untuk cookie (di Android: SharedPreferences privat aplikasi). */
interface CookieStorage { fun load(): String?; fun save(data: String) }

/** CookieJar thread-safe; bila diberi [storage], sesi login bertahan setelah aplikasi ditutup. */
class VcsCookieJar(private val storage: CookieStorage? = null) : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    init {
        storage?.load()?.lines()?.filter { it.isNotBlank() }?.forEach { line ->
            val p = line.split('\t'); if (p.size < 7) return@forEach
            val b = Cookie.Builder().name(p[0]).value(p[1]).path(p[3]).expiresAt(p[4].toLong())
            if (p[5] == "1") b.secure(); if (p[6] == "1") b.httpOnly()
            b.domain(p[2]); cookies += b.build()
        }
    }

    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (c in cookies) {
            this.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
            if (c.expiresAt > System.currentTimeMillis()) this.cookies += c
        }
        persist()
    }

    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        return cookies.filter { it.expiresAt > now && it.matches(url) }
    }

    @Synchronized fun clear() { cookies.clear(); persist() }
    @Synchronized fun header(url: HttpUrl): String = loadForRequest(url).joinToString("; ") { "${it.name}=${it.value}" }
    @Synchronized fun hasSession(): Boolean = cookies.any { it.name == "vcs_session" && it.expiresAt > System.currentTimeMillis() }

    private fun persist() {
        storage?.save(cookies.joinToString("\n") { "${it.name}\t${it.value}\t${it.domain}\t${it.path}\t${it.expiresAt}\t${if (it.secure) 1 else 0}\t${if (it.httpOnly) 1 else 0}" })
    }
}
