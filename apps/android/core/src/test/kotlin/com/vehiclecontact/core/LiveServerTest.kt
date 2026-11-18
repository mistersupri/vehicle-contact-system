package com.vehiclecontact.core

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Tes kontrak terhadap server API SUNGGUHAN. Dilewati bila VCS_TEST_URL tidak diset.
 * Jalankan: VCS_TEST_URL=http://localhost:4000 ./gradlew :core:test   (server dengan data `npm run seed:demo`)
 */
class LiveServerTest {
    private val base = System.getenv("VCS_TEST_URL")
    private val jar = VcsCookieJar()
    private val http by lazy { OkHttpClient.Builder().cookieJar(jar).pingInterval(20, TimeUnit.SECONDS).build() }
    private val api by lazy { ApiClient(base, http) }

    @Test fun `login, data pemilik, dan semua endpoint didekode oleh model Kotlin`() = runBlocking<Unit> {
        assumeTrue(base != null)
        val login = api.login("demo@example.com", "Demo12345!"); assertEquals("demo@example.com", login.user!!.email)
        assertTrue(jar.hasSession()); assertEquals("demo@example.com", api.me().email)
        val sum = api.summary(); assertTrue(sum.vehicles.total >= 1)
        val vs = api.vehicles(); assertTrue(vs.isNotEmpty()); val v = vs.first { it.qr != null }
        assertTrue(v.qr!!.public_url.contains("/v/"))
        val png = api.qrPng(v.id); assertEquals(0x89.toByte(), png[0]) // magic PNG
        val rs = api.reports(); assertTrue(rs.reports.isNotEmpty())
        val withPhoto = rs.reports.firstOrNull { it.photo_count > 0 }
        val d = api.report((withPhoto ?: rs.reports.first()).id); assertTrue(d.message.isNotBlank())
        if (withPhoto != null) assertTrue(api.attachment(api.report(withPhoto.id).attachments.first().id, thumb = true).size > 100)
        assertTrue(api.reportHistory(d.id).isNotEmpty())
        assertNotNull(api.calls()); val cs = api.callSettings(); assertTrue(cs.ring_timeout_seconds in 15..90)
        api.saveCallSettings(CallSettingsInput(cs.webrtc_enabled, cs.call_availability, cs.ring_timeout_seconds, cs.max_call_duration_seconds, cs.allow_anonymous_webrtc, cs.quiet_hours))
        assertNotNull(api.channels()); assertNotNull(api.deliveries())
        // CRUD kendaraan
        val nv = api.createVehicle(VehicleInput("T 1 NTV", "Mobil", "Uji", null, "Merah", "Budi S.")); assertEquals("T 1 NTV", nv.plate_number)
        assertEquals("Nonaktif", Labels.vehicleStatus[api.setVehicleActive(nv.id, false).status])
        api.deleteVehicle(nv.id)
        // validasi server dipetakan
        val e = try { api.createVehicle(VehicleInput("", "Mobil", null, null, null, "")); null } catch (e: ApiException) { e }
        assertEquals("VALIDATION_ERROR", e!!.code)
        api.logout(); assertTrue(try { api.me(); false } catch (e: ApiException) { e.isUnauthorized })
    }

    @Test fun `signaling dering, terima, offer + ICE, akhiri - sesuai server sungguhan`() = runBlocking<Unit> {
        assumeTrue(base != null)
        api.login("demo@example.com", "Demo12345!")
        val vehicle = api.vehicles().first { it.qr != null && it.status == "ACTIVE" }
        val token = vehicle.qr!!.public_url.substringAfter("/v/")
        val events = LinkedBlockingQueue<SignalEvent>()
        val wsUrl = base.replaceFirst("http", "ws") + "/api/v1/call-signaling"
        val owner = http.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) { parseSignal(text)?.let { events.add(it) } }
        })
        fun next(): SignalEvent = events.poll(8, TimeUnit.SECONDS) ?: fail("timeout menunggu event") as Nothing
        assertEquals(SignalEvent.Hello, next())

        // pengunjung anonim memulai panggilan (REST) lalu tersambung ke signaling dengan token pendek
        val visitor = OkHttpClient()
        fun post(path: String, json: String) = visitor.newCall(Request.Builder().url("$base/api/v1$path").header("x-requested-with", "vcs").post(json.toRequestBody("application/json".toMediaType())).build()).execute()
        val started = VcsJson.parseToJsonElement(post("/public/calls", """{"vehicle_token":"$token","client_id":"kotlin-live-test-1"}""").body!!.string()).let { it as kotlinx.serialization.json.JsonObject }
        val callId = (started["call_id"] as kotlinx.serialization.json.JsonPrimitive).content; val sigToken = (started["signaling_token"] as kotlinx.serialization.json.JsonPrimitive).content
        val callerEvents = LinkedBlockingQueue<String>()
        val caller = visitor.newWebSocket(Request.Builder().url("$wsUrl?token=$sigToken").build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) { callerEvents.add(text) }
        })

        val invite = next() as SignalEvent.Invite
        assertEquals(callId, invite.callId); assertEquals(vehicle.plate_number, invite.plate)

        // reducer + pesan balasan nyata
        var st = CallReducer.reduce(CallState.Idle, CallInput.Signal(invite)); assertTrue(st.state is CallState.Ringing)
        st = CallReducer.reduce(st.state, CallInput.UserAccept)
        for (ef in st.effects) if (ef is CallEffect.Send) owner.send(ef.message)
        assertTrue(callerEvents.poll(8, TimeUnit.SECONDS)!!.let { it.contains("call:ringing") || it.contains("call:accept") }) // penelepon diberi tahu
        var gotAccept = callerEvents.any { it.contains("call:accept") }; while (!gotAccept) gotAccept = (callerEvents.poll(8, TimeUnit.SECONDS) ?: fail("no accept") as Nothing).contains("call:accept")

        // penelepon (palsu) mengirim offer + ICE → pemilik menerima & mem-parsing
        caller.send("""{"type":"call:offer","sdp":{"type":"offer","sdp":"v=0 fake"}}""")
        var offer: SignalEvent.Offer? = null
        while (offer == null) { val e = next(); if (e is SignalEvent.Offer) offer = e }
        assertEquals("v=0 fake", offer.sdp); assertTrue("server memberi ICE server", offer.iceServers.isNotEmpty())
        st = CallReducer.reduce(st.state, CallInput.Signal(offer)); assertTrue(st.effects.single() is CallEffect.StartPeer)
        caller.send("""{"type":"call:ice-candidate","candidate":{"candidate":"candidate:1 1 udp 2122260223 10.0.0.1 5000 typ host","sdpMid":"0","sdpMLineIndex":0}}""")
        var ice: SignalEvent.Ice? = null
        while (ice == null) { val e = next(); if (e is SignalEvent.Ice) ice = e }
        assertEquals("0", ice.candidate.sdpMid)

        // pemilik membalas answer; penelepon menerima format yang benar
        owner.send(SignalOut.answer(callId, "v=0 answer")); owner.send(SignalOut.ice(callId, IceCandidateInfo("candidate:9 1 udp 1 10.0.0.2 6000 typ host", "0", 0)))
        var gotAnswer = false; repeat(5) { if (!gotAnswer) gotAnswer = callerEvents.poll(3, TimeUnit.SECONDS)?.contains("call:answer") == true }; assertTrue(gotAnswer)

        // akhiri → riwayat COMPLETED
        st = CallReducer.reduce(CallState.Connected(callId, invite.plate), CallInput.UserHangup)
        for (ef in st.effects) if (ef is CallEffect.Send) owner.send(ef.message)
        Thread.sleep(800)
        assertEquals("COMPLETED", api.calls().first { it.id == callId }.status)
        owner.close(1000, null); caller.close(1000, null)
    }
}
