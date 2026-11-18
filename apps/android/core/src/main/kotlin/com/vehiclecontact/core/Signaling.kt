package com.vehiclecontact.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class IceServerInfo(val urls: List<String>, val username: String? = null, val credential: String? = null)
data class IceCandidateInfo(val candidate: String, val sdpMid: String?, val sdpMLineIndex: Int)

/** Pesan dari server signaling (`/api/v1/call-signaling`). */
sealed interface SignalEvent {
    data object Hello : SignalEvent
    data class Invite(val callId: String, val reference: String, val plate: String, val ringTimeoutSec: Int) : SignalEvent
    data class Cancelled(val callId: String, val reason: String?) : SignalEvent
    data class Taken(val callId: String) : SignalEvent
    data class Offer(val callId: String, val sdp: String, val iceServers: List<IceServerInfo>) : SignalEvent
    data class Ice(val callId: String, val candidate: IceCandidateInfo) : SignalEvent
    data class End(val callId: String, val reason: String?) : SignalEvent
    data class Error(val reason: String?) : SignalEvent
    data class Unknown(val type: String) : SignalEvent
}

private fun JsonObject.str(k: String) = this[k]?.let { (it as? JsonPrimitive)?.contentOrNull }

fun parseSignal(text: String): SignalEvent? {
    val o = try { VcsJson.parseToJsonElement(text).jsonObject } catch (_: Exception) { return null }
    val type = o.str("type") ?: return null
    val id = o.str("call_id") ?: ""
    return when (type) {
        "hello" -> SignalEvent.Hello
        "call:invite" -> SignalEvent.Invite(id, o.str("reference") ?: "", o.str("plate") ?: "", (o["ring_timeout"] as? JsonPrimitive)?.intOrNull ?: 45)
        "call:cancelled" -> SignalEvent.Cancelled(id, o.str("reason"))
        "call:taken" -> SignalEvent.Taken(id)
        "call:offer" -> {
            val sdp = o["sdp"]?.jsonObject?.str("sdp") ?: return null
            SignalEvent.Offer(id, sdp, parseIce(o["ice_servers"]))
        }
        "call:ice-candidate" -> {
            val c = o["candidate"] as? JsonObject ?: return null
            SignalEvent.Ice(id, IceCandidateInfo(c.str("candidate") ?: return null, c.str("sdpMid"), (c["sdpMLineIndex"] as? JsonPrimitive)?.intOrNull ?: 0))
        }
        "call:end" -> SignalEvent.End(id, o.str("reason"))
        "call:error", "call:reject", "call:timeout" -> SignalEvent.Error(o.str("reason"))
        else -> SignalEvent.Unknown(type)
    }
}

private fun parseIce(e: JsonElement?): List<IceServerInfo> = (e as? JsonArray).orEmpty().mapNotNull { s ->
    val o = s as? JsonObject ?: return@mapNotNull null
    val urls = when (val u = o["urls"]) {
        is JsonArray -> u.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        is JsonPrimitive -> listOfNotNull(u.contentOrNull)
        else -> emptyList()
    }
    if (urls.isEmpty()) null else IceServerInfo(urls, o.str("username"), o.str("credential"))
}
private fun JsonArray?.orEmpty() = this ?: JsonArray(emptyList())

/** Pesan ke server. */
object SignalOut {
    private fun msg(type: String, callId: String, extra: (kotlinx.serialization.json.JsonObjectBuilder.() -> Unit)? = null) =
        buildJsonObject { put("type", type); put("call_id", callId); extra?.invoke(this) }.toString()

    fun accept(callId: String) = msg("call:accept", callId)
    fun reject(callId: String) = msg("call:reject", callId)
    fun end(callId: String) = msg("call:end", callId)
    fun answer(callId: String, sdp: String) = msg("call:answer", callId) { put("sdp", buildJsonObject { put("type", "answer"); put("sdp", sdp) }) }
    fun ice(callId: String, c: IceCandidateInfo) = msg("call:ice-candidate", callId) {
        put("candidate", buildJsonObject {
            put("candidate", c.candidate); put("sdpMid", c.sdpMid); put("sdpMLineIndex", c.sdpMLineIndex)
        })
    }
}

/** Jeda sambung ulang: eksponensial 1s → 15s. `jitter` disuntikkan agar bisa diuji. */
class Backoff(private val baseMs: Long = 1000, private val maxMs: Long = 15000, private val jitter: () -> Double = { Math.random() }) {
    private var attempt = 0
    fun next(): Long {
        val exp = minOf(maxMs, baseMs shl minOf(attempt, 10))
        attempt++
        return exp / 2 + (exp / 2 * jitter()).toLong()
    }
    fun reset() { attempt = 0 }
}
