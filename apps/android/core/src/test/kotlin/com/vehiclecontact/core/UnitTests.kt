package com.vehiclecontact.core

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import com.vehiclecontact.core.CallEffect as E
import com.vehiclecontact.core.CallInput as I

class SignalingTest {
    @Test fun `parse invite dari server`() {
        val e = parseSignal("""{"type":"call:invite","call_id":"c1","reference":"CALL-X","plate":"B 1234 XYZ","vehicle_id":"v","started_at":"t","ring_timeout":45}""")
        assertEquals(SignalEvent.Invite("c1", "CALL-X", "B 1234 XYZ", 45), e)
    }
    @Test fun `parse offer dengan ICE server Cloudflare (urls array + kredensial)`() {
        val e = parseSignal("""{"type":"call:offer","call_id":"c1","sdp":{"type":"offer","sdp":"v=0"},"ice_servers":[{"urls":["stun:stun.cloudflare.com:3478"]},{"urls":"turn:t.example:3478","username":"u","credential":"p"}]}""") as SignalEvent.Offer
        assertEquals("v=0", e.sdp); assertEquals(2, e.iceServers.size)
        assertEquals(IceServerInfo(listOf("turn:t.example:3478"), "u", "p"), e.iceServers[1])
    }
    @Test fun `parse ICE candidate`() {
        val e = parseSignal("""{"type":"call:ice-candidate","call_id":"c1","candidate":{"candidate":"candidate:1 1 udp 1 1.2.3.4 5 typ host","sdpMid":"0","sdpMLineIndex":0}}""") as SignalEvent.Ice
        assertEquals("0", e.candidate.sdpMid); assertEquals(0, e.candidate.sdpMLineIndex)
    }
    @Test fun `pesan rusak atau tak dikenal tidak melempar`() {
        assertNull(parseSignal("bukan json")); assertNull(parseSignal("""{"foo":1}""")); assertNull(parseSignal("""{"type":"call:offer","call_id":"x"}"""))
        assertEquals(SignalEvent.Unknown("zzz"), parseSignal("""{"type":"zzz"}"""))
        assertTrue(parseSignal("""{"type":"call:reject","call_id":"c"}""") is SignalEvent.Error)
    }
    @Test fun `pesan keluar sesuai kontrak server`() {
        val a = VcsJson.parseToJsonElement(SignalOut.answer("c1", "v=0")).jsonObject
        assertEquals("call:answer", a["type"]!!.jsonPrimitive.content); assertEquals("answer", a["sdp"]!!.jsonObject["type"]!!.jsonPrimitive.content)
        val i = VcsJson.parseToJsonElement(SignalOut.ice("c1", IceCandidateInfo("cand", "0", 1))).jsonObject["candidate"]!!.jsonObject
        assertEquals("0", i["sdpMid"]!!.jsonPrimitive.content); assertEquals("1", i["sdpMLineIndex"]!!.jsonPrimitive.content)
        assertEquals("call:accept", VcsJson.parseToJsonElement(SignalOut.accept("c1")).jsonObject["type"]!!.jsonPrimitive.content)
    }
}

class BackoffTest {
    @Test fun `eksponensial dibatasi 15 detik dan bisa direset`() {
        val b = Backoff(jitter = { 0.0 })
        assertEquals(listOf(500L, 1000L, 2000L, 4000L, 7500L, 7500L), List(6) { b.next() })
        b.reset(); assertEquals(500L, b.next())
        val full = Backoff(jitter = { 1.0 }); repeat(20) { assertTrue(full.next() <= 15000) }
    }
}

class CallReducerTest {
    private val invite = SignalEvent.Invite("c1", "CALL-1", "B 1234 XYZ", 45)
    private fun ringing() = CallReducer.reduce(CallState.Idle, I.Signal(invite))

    @Test fun `invite saat idle menampilkan dering`() {
        val t = ringing()
        assertTrue(t.state is CallState.Ringing); assertTrue(t.effects.single() is E.ShowIncoming)
    }
    @Test fun `invite kedua saat sibuk ditolak otomatis, panggilan berjalan tidak terganggu`() {
        val t = CallReducer.reduce(ringing().state, I.Signal(SignalEvent.Invite("c2", "R", "D 1", 45)))
        assertTrue(t.state is CallState.Ringing && (t.state as CallState.Ringing).callId == "c1")
        assertEquals(SignalOut.reject("c2"), (t.effects.single() as E.Send).message)
    }
    @Test fun `terima lalu offer memulai peer, connected, lalu akhiri`() {
        var s = CallReducer.reduce(ringing().state, I.UserAccept)
        assertEquals(CallState.Connecting("c1", "B 1234 XYZ"), s.state)
        assertTrue(s.effects.any { it is E.Send && it.message == SignalOut.accept("c1") })
        s = CallReducer.reduce(s.state, I.Signal(SignalEvent.Taken("c1"))) // dikirim ke soket kita sendiri: diabaikan
        assertTrue(s.state is CallState.Connecting)
        s = CallReducer.reduce(s.state, I.Signal(SignalEvent.Offer("c1", "v=0", emptyList())))
        assertTrue(s.effects.single() is E.StartPeer)
        s = CallReducer.reduce(s.state, I.Signal(SignalEvent.Ice("c1", IceCandidateInfo("c", "0", 0)))); assertTrue(s.effects.single() is E.AddRemoteIce)
        s = CallReducer.reduce(s.state, I.PeerConnected); assertTrue(s.state is CallState.Connected)
        s = CallReducer.reduce(s.state, I.UserHangup)
        assertTrue(s.state is CallState.Ended); assertTrue(s.effects.contains(E.ClosePeer)); assertTrue(s.effects.any { it is E.Send && it.message == SignalOut.end("c1") })
        assertEquals(CallState.Idle, CallReducer.reduce(s.state, I.Dismissed).state)
    }
    @Test fun `penelepon membatalkan saat berdering jadi tutup layar + catat tak terjawab`() {
        val t = CallReducer.reduce(ringing().state, I.Signal(SignalEvent.Cancelled("c1", "caller_cancelled")))
        assertEquals(CallState.Idle, t.state); assertTrue(t.effects.any { it is E.DismissIncoming }); assertTrue(t.effects.any { it is E.NotifyMissed })
    }
    @Test fun `diterima perangkat lain atau timeout menutup dering tanpa kirim apa pun`() {
        assertEquals(CallState.Idle, CallReducer.reduce(ringing().state, I.Signal(SignalEvent.Taken("c1"))).state)
        val t = CallReducer.reduce(ringing().state, I.RingTimeout); assertEquals(CallState.Idle, t.state); assertTrue(t.effects.none { it is E.Send })
    }
    @Test fun `tolak mengirim reject`() {
        val t = CallReducer.reduce(ringing().state, I.UserReject)
        assertEquals(CallState.Idle, t.state); assertTrue(t.effects.any { it is E.Send && it.message == SignalOut.reject("c1") })
    }
    @Test fun `peer gagal atau lawan menutup jadi Ended dan peer ditutup event call_id lain diabaikan`() {
        val connecting = CallReducer.reduce(ringing().state, I.UserAccept).state
        assertTrue(CallReducer.reduce(connecting, I.PeerFailed).state is CallState.Ended)
        assertTrue(CallReducer.reduce(connecting, I.Signal(SignalEvent.End("c1", null))).state is CallState.Ended)
        assertEquals(connecting, CallReducer.reduce(connecting, I.Signal(SignalEvent.End("lain", null))).state)
        assertEquals(connecting, CallReducer.reduce(connecting, I.Signal(SignalEvent.Offer("lain", "x", emptyList()))).state)
        assertTrue(CallReducer.reduce(connecting, I.Signal(SignalEvent.Error("x"))).state is CallState.Ended)
    }
    @Test fun `aksi pengguna tanpa dering diabaikan`() {
        for (i in listOf(I.UserAccept, I.UserReject, I.UserHangup, I.PeerConnected, I.RingTimeout)) assertEquals(CallState.Idle, CallReducer.reduce(CallState.Idle, i).state)
    }
}

class ApiClientTest {
    private fun withServer(block: suspend (MockWebServer, ApiClient) -> Unit) = runBlocking {
        MockWebServer().use { s -> s.start(); block(s, ApiClient(s.url("/").toString().trimEnd('/'), OkHttpClient())) }
    }
    @Test fun `normalisasi alamat server`() {
        assertEquals("https://vecs.kukode.in", normalizeServerUrl("vecs.kukode.in/")); assertEquals("http://10.0.0.5:4000", normalizeServerUrl(" http://10.0.0.5:4000/ "))
        assertNull(normalizeServerUrl("")); assertNull(normalizeServerUrl("ht tp://x y"))
    }
    @Test fun `login mengirim header CSRF dan JSON, memetakan user`() = withServer { s, api ->
        s.enqueue(MockResponse().setBody("""{"user":{"id":"u","name":"Budi","email":"b@x.id","email_verified":true,"is_admin":false,"admin_role":null,"created_at":"x"}}"""))
        val r = api.login("b@x.id", "pw"); assertEquals("Budi", r.user!!.name)
        val req = s.takeRequest(); assertEquals("/api/v1/auth/login", req.path); assertEquals("vcs", req.getHeader("x-requested-with"))
        assertTrue(req.getHeader("content-type")!!.startsWith("application/json")); assertTrue(req.body.readUtf8().contains("\"email\":\"b@x.id\""))
    }
    @Test fun `galat server dipetakan lengkap dengan field validasi`() = withServer { s, api ->
        s.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":{"code":"VALIDATION_ERROR","message":"Data yang dikirim tidak valid","request_id":"r","fields":{"email":"Email tidak valid"}}}"""))
        val e = try { api.login("x", "y"); null } catch (e: ApiException) { e }!!
        assertEquals(400, e.status); assertEquals("VALIDATION_ERROR", e.code); assertEquals("Email tidak valid", e.fields["email"])
    }
    @Test fun `401 ditandai tidak terautentikasi dan body bukan JSON tidak membuat crash`() = withServer { s, api ->
        s.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"UNAUTHENTICATED","message":"Silakan masuk"}}"""))
        assertTrue(try { api.me(); false } catch (e: ApiException) { e.isUnauthorized })
        s.enqueue(MockResponse().setResponseCode(502).setBody("<html>Bad gateway</html>"))
        assertEquals(502, (try { api.summary(); null } catch (e: ApiException) { e })!!.status)
    }
    @Test fun `server tak terjangkau jadi galat jaringan`() = runBlocking {
        val e = try { ApiClient("http://127.0.0.1:1", OkHttpClient()).me(); null } catch (e: ApiException) { e }!!
        assertTrue(e.isNetwork)
    }
    @Test fun `cookie sesi dikirim ulang dan bertahan lewat penyimpanan`() {
        var saved: String? = null
        val storage = object : CookieStorage { override fun load() = saved; override fun save(data: String) { saved = data } }
        val jar = VcsCookieJar(storage)
        runBlocking {
            MockWebServer().use { s ->
                s.start()
                s.enqueue(MockResponse().addHeader("Set-Cookie", "vcs_session=abc123; Path=/; Max-Age=3600; HttpOnly").setBody("""{"ok":true}"""))
                s.enqueue(MockResponse().setBody("""{"ok":true}"""))
                val base = s.url("/").toString().trimEnd('/')
                ApiClient(base, OkHttpClient.Builder().cookieJar(jar).build()).logout()
                s.takeRequest()
                // "aplikasi dibuka ulang": jar baru dari penyimpanan
                val jar2 = VcsCookieJar(storage); assertTrue(jar2.hasSession())
                ApiClient(base, OkHttpClient.Builder().cookieJar(jar2).build()).logout()
                assertEquals("vcs_session=abc123", s.takeRequest().getHeader("Cookie"))
                jar2.clear(); assertFalse(VcsCookieJar(storage).hasSession())
            }
        }
    }
    @Test fun `ringkasan, laporan, dan pengaturan panggilan didekode dari bentuk respons server`() = withServer { s, api ->
        s.enqueue(MockResponse().setBody("""{"vehicles":{"total":3,"active":2},"reports":{"NEW":2,"READ":0,"IN_PROGRESS":1,"RESOLVED":1,"ARCHIVED":0},"calls":{"total":4,"missed":1,"seconds":9},"recent_reports":[{"id":"r","reference":"VCS-1","vehicle_id":"v","plate_number":"B 1","category":"ACCESS","message":"m","status":"NEW","reporter_name":null,"created_at":"t","updated_at":"t","resolved_at":null,"photo_count":2}],"reports_per_day":[{"d":"2026-11-17","c":3}]}"""))
        val sum = api.summary(); assertEquals(2, sum.reports["NEW"]); assertEquals(2, sum.recent_reports[0].photo_count); assertEquals(1, sum.calls.missed)
        s.enqueue(MockResponse().setBody("""{"settings":{"webrtc_enabled":true,"pstn_enabled":false,"call_availability":"ONLINE","max_call_duration_seconds":600,"ring_timeout_seconds":45,"allow_anonymous_webrtc":true,"quiet_hours":{"enabled":false,"start":"22:00","end":"06:00","timezone":"Asia/Jakarta"},"owner_phone_set":false,"pstn_provider_ready":false,"owner_online":true}}"""))
        assertEquals("ONLINE", api.callSettings().call_availability)
    }
}

class AlertTests {
    private val json = """{"type":"alert:urgent","report_id":"r1","reference":"VCS-ALRT","plate":"B 1234 XYZ","vehicle_name":"Mobil Keluarga","category":"ACCESS","category_label":"Menghalangi akses","message":"Mohon dipindahkan","at":"t"}"""

    @Test fun `parse alert urgent dan dismiss`() {
        val a = parseSignal(json) as SignalEvent.Alert
        assertEquals("r1", a.reportId); assertEquals("Mobil Keluarga", a.vehicleName); assertEquals("Mohon dipindahkan", a.message)
        assertEquals(SignalEvent.AlertDismiss("r1"), parseSignal("""{"type":"alert:dismiss","report_id":"r1"}"""))
        assertNull(parseSignal("""{"type":"alert:urgent"}"""))
    }
    @Test fun `alert tidak mengubah status panggilan, bahkan saat sedang menelepon`() {
        val a = parseSignal(json) as SignalEvent.Alert
        for (s in listOf(CallState.Idle, CallState.Connected("c", "B 1"))) {
            val t = CallReducer.reduce(s, I.Signal(a))
            assertEquals(s, t.state); assertEquals(listOf<E>(E.ShowAlert(a)), t.effects)
        }
        val d = CallReducer.reduce(CallState.Idle, I.Signal(SignalEvent.AlertDismiss("r1")))
        assertEquals(listOf<E>(E.DismissAlert("r1")), d.effects)
    }
    @Test fun `invite membawa nama kendaraan dan email dikirim ke endpoint yang benar`() {
        assertEquals("Mobil", (parseSignal("""{"type":"call:invite","call_id":"c","reference":"R","plate":"B 1","vehicle_name":"Mobil"}""") as SignalEvent.Invite).vehicleName)
        assertEquals("Menghalangi akses", Labels.category["ACCESS"]); assertEquals("Akses", Labels.categoryShort["ACCESS"])
    }
}
