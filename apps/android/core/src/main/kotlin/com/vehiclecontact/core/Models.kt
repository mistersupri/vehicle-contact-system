package com.vehiclecontact.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Konfigurasi JSON bersama: toleran terhadap field baru dari server. */
val VcsJson = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true; encodeDefaults = true }

@Serializable data class User(
    val id: String, val name: String, val email: String,
    val email_verified: Boolean = false, val is_admin: Boolean = false, val admin_role: String? = null,
)
@Serializable data class UserResponse(val user: User)
/** Login: pemilik langsung mendapat `user`; admin mendapat `mfa_required` (MFA hanya di web). */
@Serializable data class LoginResponse(val user: User? = null, val mfa_required: Boolean = false)
@Serializable data class LoginRequest(val email: String, val password: String)
@Serializable data class RegisterRequest(val name: String, val email: String, val password: String)
@Serializable data class RegisterResponse(val ok: Boolean = true, val email_sent: Boolean = true)
@Serializable data class EmailRequest(val email: String)
@Serializable data class Ok(val ok: Boolean = true)

@Serializable data class Qr(val id: String, val created_at: String, val public_url: String)
@Serializable data class Vehicle(
    val id: String, val plate_number: String, val vehicle_type: String,
    val brand: String? = null, val model: String? = null, val color: String? = null,
    val owner_display_name: String, val status: String, val created_at: String = "",
    val qr: Qr? = null, val report_count: Int = 0, val new_report_count: Int = 0,
)
@Serializable data class VehiclesResponse(val vehicles: List<Vehicle>)
@Serializable data class VehicleResponse(val vehicle: Vehicle)
@Serializable data class VehicleInput(
    val plate_number: String, val vehicle_type: String,
    val brand: String? = null, val model: String? = null, val color: String? = null, val owner_display_name: String,
)

@Serializable data class Report(
    val id: String, val reference: String, val vehicle_id: String = "", val plate_number: String,
    val category: String, val message: String, val status: String,
    val reporter_name: String? = null, val created_at: String, val updated_at: String = "",
    val resolved_at: String? = null, val photo_count: Int = 0,
)
@Serializable data class ReportsResponse(val reports: List<Report>, val total: Int = 0)
@Serializable data class Attachment(val id: String, val mime_type: String = "", val width: Int? = null, val height: Int? = null)
@Serializable data class ReportDetail(
    val id: String, val reference: String, val plate_number: String, val category: String, val message: String, val status: String,
    val reporter_name: String? = null, val reporter_phone: String? = null, val created_at: String,
    val attachments: List<Attachment> = emptyList(), val source_blocked: Boolean = false,
)
@Serializable data class ReportDetailResponse(val report: ReportDetail)
@Serializable data class StatusChange(val status: String, val note: String? = null)
@Serializable data class HistoryItem(val old_status: String? = null, val new_status: String, val note: String? = null, val created_at: String, val system: Int? = null)
@Serializable data class HistoryResponse(val history: List<HistoryItem>)

@Serializable data class CallRow(
    val id: String, val reference: String = "", val plate_number: String, val call_type: String, val status: String,
    val started_at: String, val duration_seconds: Int? = null, val end_reason: String? = null,
)
@Serializable data class CallsResponse(val calls: List<CallRow>)

@Serializable data class SummaryVehicles(val total: Int = 0, val active: Int = 0)
@Serializable data class SummaryCalls(val total: Int = 0, val missed: Int = 0, val seconds: Int = 0)
@Serializable data class Summary(
    val vehicles: SummaryVehicles = SummaryVehicles(),
    val reports: Map<String, Int> = emptyMap(),
    val calls: SummaryCalls = SummaryCalls(),
    val recent_reports: List<Report> = emptyList(),
)

@Serializable data class QuietHours(val enabled: Boolean = false, val start: String = "22:00", val end: String = "06:00", val timezone: String = "Asia/Jakarta")
@Serializable data class CallSettings(
    val webrtc_enabled: Boolean = true, val pstn_enabled: Boolean = false, val call_availability: String = "ONLINE",
    val max_call_duration_seconds: Int = 600, val ring_timeout_seconds: Int = 45, val allow_anonymous_webrtc: Boolean = true,
    val quiet_hours: QuietHours = QuietHours(), val owner_phone_set: Boolean = false, val pstn_provider_ready: Boolean = false,
)
@Serializable data class CallSettingsResponse(val settings: CallSettings)
@Serializable data class CallSettingsInput(
    val webrtc_enabled: Boolean, val call_availability: String, val ring_timeout_seconds: Int,
    val max_call_duration_seconds: Int, val allow_anonymous_webrtc: Boolean, val quiet_hours: QuietHours,
)

@Serializable data class Channel(val id: String, val channel: String, val destination_masked: String = "", val verified: Boolean = false, val enabled: Boolean = true)
@Serializable data class Providers(val telegram_live: Boolean = false, val whatsapp_live: Boolean = false, val telegram_bot_username: String? = null)
@Serializable data class ChannelsResponse(val channels: List<Channel> = emptyList(), val telegram_link_pending: Boolean = false, val providers: Providers = Providers())
@Serializable data class EnabledInput(val enabled: Boolean)
@Serializable data class TestInput(val channel: String)
@Serializable data class TelegramConnectResponse(val expires_in: Int = 900, val deep_link: String? = null, val dev_token: String? = null)
@Serializable data class WhatsappConnectInput(val phone: String)
@Serializable data class WhatsappConnectResponse(val ok: Boolean = true, val dev_code: String? = null)
@Serializable data class WhatsappVerifyInput(val code: String)
@Serializable data class Delivery(
    val id: String, val channel: String, val status: String, val attempts: Int = 0,
    val created_at: String, val kind: String = "", val plate: String? = null, val last_error_code: String? = null,
)
@Serializable data class DeliveriesResponse(val deliveries: List<Delivery> = emptyList())

/** Label Bahasa Indonesia yang sama dengan web. */
object Labels {
    val reportStatus = mapOf("NEW" to "Baru", "READ" to "Dibaca", "IN_PROGRESS" to "Diproses", "RESOLVED" to "Selesai", "ARCHIVED" to "Arsip")
    val category = mapOf("PARKING" to "Menghalangi parkir", "ACCESS" to "Menghalangi akses", "LIGHT" to "Lampu menyala", "EMERGENCY" to "Darurat", "DAMAGE" to "Dugaan kerusakan", "OTHER" to "Lainnya")
    val callStatus = mapOf("RINGING" to "Berdering", "ACCEPTED" to "Berlangsung", "COMPLETED" to "Selesai", "MISSED" to "Tak terjawab", "REJECTED" to "Ditolak", "FAILED" to "Gagal")
    val vehicleStatus = mapOf("ACTIVE" to "Aktif", "INACTIVE" to "Nonaktif", "SUSPENDED" to "Ditangguhkan")
}
