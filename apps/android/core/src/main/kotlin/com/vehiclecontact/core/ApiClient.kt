package com.vehiclecontact.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.serializer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

class ApiException(val status: Int, val code: String, message: String, val fields: Map<String, String> = emptyMap()) : Exception(message) {
    val isUnauthorized get() = status == 401
    val isNetwork get() = status == 0
}

/** Normalisasi alamat server yang diketik pengguna: tambah https://, buang garis miring akhir. */
fun normalizeServerUrl(raw: String): String? {
    var s = raw.trim()
    if (s.isEmpty()) return null
    if (!s.contains("://")) s = "https://$s"
    s = s.trimEnd('/')
    return try { s.toHttpUrl(); s } catch (_: IllegalArgumentException) { null }
}

/**
 * Klien REST `/api/v1`. Sesi memakai cookie (CookieJar disediakan pemanggil); header `x-requested-with: vcs`
 * wajib untuk request yang mengubah data (perlindungan CSRF di server).
 */
class ApiClient(var baseUrl: String, val http: OkHttpClient, val json: kotlinx.serialization.json.Json = VcsJson) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun url(path: String) = "${baseUrl.trimEnd('/')}/api/v1$path"

    private fun parseError(status: Int, body: String): ApiException {
        return try {
            val e = json.parseToJsonElement(body).jsonObject["error"]?.jsonObject
            val fields = (e?.get("fields") as? JsonObject)?.mapValues { it.value.jsonPrimitive.contentOrNull ?: "" } ?: emptyMap()
            ApiException(status, e?.get("code")?.jsonPrimitive?.contentOrNull ?: "ERROR", e?.get("message")?.jsonPrimitive?.contentOrNull ?: "Terjadi kesalahan", fields)
        } catch (_: Exception) {
            ApiException(status, "ERROR", "Terjadi kesalahan ($status)")
        }
    }

    suspend fun <T> request(method: String, path: String, ser: KSerializer<T>, bodyJson: String? = null): T = withContext(Dispatchers.IO) {
        val body = when {
            bodyJson != null -> bodyJson.toRequestBody(jsonType)
            method == "GET" || method == "HEAD" -> null
            else -> "{}".toRequestBody(jsonType)
        }
        val req = Request.Builder().url(url(path)).method(method, body).header("x-requested-with", "vcs").header("accept", "application/json").build()
        try {
            http.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw parseError(res.code, text)
                json.decodeFromString(ser, text.ifEmpty { "{}" })
            }
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.")
        }
    }

    suspend inline fun <reified T> get(path: String): T = request("GET", path, serializer<T>())
    suspend inline fun <reified R, reified B> send(method: String, path: String, body: B): R =
        request(method, path, serializer<R>(), VcsJson.encodeToString(serializer<B>(), body))
    suspend inline fun <reified R> send(method: String, path: String): R = request(method, path, serializer<R>())

    /** Unduh biner (QR PNG, foto). */
    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url(path)).header("x-requested-with", "vcs").build()
        try {
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) throw parseError(res.code, res.body?.string().orEmpty())
                res.body?.bytes() ?: ByteArray(0)
            }
        } catch (e: IOException) { throw ApiException(0, "NETWORK", "Tidak dapat terhubung ke server.") }
    }

    // ---- Endpoint ----
    suspend fun login(email: String, password: String): LoginResponse = send("POST", "/auth/login", LoginRequest(email, password))
    suspend fun me(): User = get<UserResponse>("/auth/me").user
    suspend fun logout() { send<Ok>("POST", "/auth/logout") }
    suspend fun register(name: String, email: String, password: String): RegisterResponse = send("POST", "/auth/register", RegisterRequest(name, email, password))
    suspend fun forgotPassword(email: String) { send<Ok, EmailRequest>("POST", "/auth/forgot-password", EmailRequest(email)) }
    suspend fun resendVerification(email: String) { send<Ok, EmailRequest>("POST", "/auth/resend-verification", EmailRequest(email)) }

    suspend fun summary(): Summary = get("/dashboard/summary")
    suspend fun vehicles(): List<Vehicle> = get<VehiclesResponse>("/vehicles").vehicles
    suspend fun createVehicle(v: VehicleInput): Vehicle = send<VehicleResponse, VehicleInput>("POST", "/vehicles", v).vehicle
    suspend fun updateVehicle(id: String, v: VehicleInput): Vehicle = send<VehicleResponse, VehicleInput>("PATCH", "/vehicles/$id", v).vehicle
    suspend fun setVehicleActive(id: String, active: Boolean): Vehicle = send<VehicleResponse>("POST", "/vehicles/$id/${if (active) "activate" else "deactivate"}").vehicle
    suspend fun deleteVehicle(id: String) { send<Ok>("DELETE", "/vehicles/$id") }
    suspend fun regenerateQr(id: String): Vehicle = send<VehicleResponse>("POST", "/vehicles/$id/qr/regenerate").vehicle
    suspend fun revokeQr(id: String): Vehicle = send<VehicleResponse>("POST", "/vehicles/$id/qr/revoke").vehicle
    suspend fun qrPng(id: String): ByteArray = bytes("/vehicles/$id/qr?format=png")

    suspend fun reports(status: String? = null, limit: Int = 50, page: Int = 1): ReportsResponse {
        val q = buildList { add("limit=$limit"); add("page=$page"); if (!status.isNullOrEmpty()) add("status=$status") }.joinToString("&")
        return get("/reports?$q")
    }
    suspend fun report(id: String): ReportDetail = get<ReportDetailResponse>("/reports/$id").report
    suspend fun reportHistory(id: String): List<HistoryItem> = get<HistoryResponse>("/reports/$id/history").history
    suspend fun setReportStatus(id: String, status: String, note: String? = null) { send<JsonObject, StatusChange>("PATCH", "/reports/$id/status", StatusChange(status, note)) }
    suspend fun attachment(id: String, thumb: Boolean = false): ByteArray = bytes("/attachments/$id${if (thumb) "?thumb=1" else ""}")

    suspend fun calls(missedOnly: Boolean = false): List<CallRow> = get<CallsResponse>(if (missedOnly) "/calls/missed?limit=50" else "/calls/history?limit=50").calls
    suspend fun callSettings(): CallSettings = get<CallSettingsResponse>("/call-settings").settings
    suspend fun saveCallSettings(i: CallSettingsInput): CallSettings = send<CallSettingsResponse, CallSettingsInput>("PATCH", "/call-settings", i).settings

    suspend fun channels(): ChannelsResponse = get("/notifications/channels")
    suspend fun setChannelEnabled(id: String, enabled: Boolean) { send<Ok, EnabledInput>("PATCH", "/notifications/channels/$id", EnabledInput(enabled)) }
    suspend fun testChannel(channel: String) { send<Ok, TestInput>("POST", "/notifications/test", TestInput(channel)) }
    suspend fun telegramConnect(): TelegramConnectResponse = send("POST", "/notifications/telegram/connect")
    suspend fun telegramDisconnect() { send<Ok>("POST", "/notifications/telegram/disconnect") }
    suspend fun whatsappConnect(phone: String): WhatsappConnectResponse = send("POST", "/notifications/whatsapp/connect", WhatsappConnectInput(phone))
    suspend fun whatsappVerify(code: String) { send<Ok, WhatsappVerifyInput>("POST", "/notifications/whatsapp/verify", WhatsappVerifyInput(code)) }
    suspend fun deliveries(): List<Delivery> = get<DeliveriesResponse>("/notifications/deliveries?limit=15").deliveries
}
