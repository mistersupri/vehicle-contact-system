package com.vehiclecontact.app.call

import android.content.Context
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Network
import android.util.Log
import com.vehiclecontact.app.VecsApp
import com.vehiclecontact.core.Backoff
import com.vehiclecontact.core.CallEffect
import com.vehiclecontact.core.CallInput
import com.vehiclecontact.core.CallReducer
import com.vehiclecontact.core.CallState
import com.vehiclecontact.core.SignalEvent
import com.vehiclecontact.core.parseSignal
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

enum class Conn { OFFLINE, CONNECTING, ONLINE }

sealed interface EngineEvent { data class Missed(val plate: String) : EngineEvent }

/**
 * Jantung panggilan: menjaga WebSocket signaling ke server (selama CallService hidup), menjalankan [CallReducer],
 * dan mengelola sesi WebRTC. Tidak memakai layanan push pihak ketiga.
 */
class CallEngine(private val app: VecsApp) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private val _state = MutableStateFlow<CallState>(CallState.Idle)
    private val _conn = MutableStateFlow(Conn.OFFLINE)
    private val _muted = MutableStateFlow(false)
    private val _speaker = MutableStateFlow(false)
    private val _seconds = MutableStateFlow(0)
    private val _events = MutableSharedFlow<EngineEvent>(extraBufferCapacity = 16)
    private val _alert = MutableStateFlow<SignalEvent.Alert?>(null)

    val state: StateFlow<CallState> get() = _state
    val connection: StateFlow<Conn> get() = _conn
    val muted: StateFlow<Boolean> get() = _muted
    val speaker: StateFlow<Boolean> get() = _speaker
    val seconds: StateFlow<Int> get() = _seconds
    val events: SharedFlow<EngineEvent> get() = _events
    /** Notifikasi mendesak yang sedang tampil (tanpa audio/WebRTC). */
    val alert: StateFlow<SignalEvent.Alert?> get() = _alert

    @Volatile private var running = false
    private var loop: Job? = null
    private var ws: WebSocket? = null
    private var peer: PeerSession? = null
    private var ringTimer: Job? = null
    private var ticker: Job? = null
    private val kick = Channel<Unit>(Channel.CONFLATED)
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    private val audio get() = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    fun start() {
        if (running) return
        running = true
        loop = scope.launch { connectLoop() }
        registerNetwork()
    }

    fun stop() {
        running = false
        loop?.cancel(); loop = null
        unregisterNetwork()
        ws?.close(1000, "stop"); ws = null
        _conn.value = Conn.OFFLINE
        synchronized(lock) {
            if (_state.value !is CallState.Idle) { dispatchLocked(CallInput.UserHangup); _state.value = CallState.Idle }
        }
    }

    private fun wsUrl() = app.session.serverUrl.trimEnd('/').replaceFirst("http", "ws") + "/api/v1/call-signaling"

    private suspend fun connectLoop() {
        val backoff = Backoff()
        while (scope.isActive && running) {
            _conn.value = Conn.CONNECTING
            val closed = CompletableDeferred<Int>()
            val socket = app.wsClient.newWebSocket(Request.Builder().url(wsUrl()).build(), object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val ev = parseSignal(text) ?: return
                    if (ev is SignalEvent.Hello) { _conn.value = Conn.ONLINE; backoff.reset() }
                    dispatch(CallInput.Signal(ev))
                }
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { closed.complete(code) }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.w(TAG, "signaling putus: ${t.message}")
                    closed.complete(response?.code ?: -1)
                }
            })
            ws = socket
            val code = closed.await()
            ws = null
            _conn.value = Conn.OFFLINE
            // koneksi signaling putus saat negosiasi → batalkan; panggilan yang sudah tersambung (P2P) dipertahankan
            if (_state.value is CallState.Connecting) dispatch(CallInput.PeerFailed)
            if (code == 4401 || code == 401) { Log.w(TAG, "sesi ditolak server"); running = false; app.onLoggedOut(); break }
            withTimeoutOrNull(backoff.next()) { kick.receive() }
        }
    }

    private fun registerNetwork() {
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            // jaringan baru/pulih: sambung ulang segera tanpa menunggu jeda backoff
            override fun onAvailable(network: Network) { if (_conn.value != Conn.ONLINE) kick.trySend(Unit) }
        }
        netCallback = cb
        runCatching { cm.registerDefaultNetworkCallback(cb) }
    }

    private fun unregisterNetwork() {
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        netCallback?.let { runCatching { cm.unregisterNetworkCallback(it) } }
        netCallback = null
    }

    // ---- Aksi pengguna ----
    fun accept() = dispatch(CallInput.UserAccept)
    fun reject() = dispatch(CallInput.UserReject)
    fun hangup() = dispatch(CallInput.UserHangup)
    fun dismissEnded() = dispatch(CallInput.Dismissed)
    fun dismissAlert() { _alert.value = null }

    fun toggleMute() { val m = !_muted.value; _muted.value = m; peer?.setMuted(m) }
    fun toggleSpeaker() {
        val s = !_speaker.value; _speaker.value = s
        @Suppress("DEPRECATION") audio.isSpeakerphoneOn = s
    }

    fun dispatch(input: CallInput) { synchronized(lock) { dispatchLocked(input) } }

    private fun dispatchLocked(input: CallInput) {
        val prev = _state.value
        val t = CallReducer.reduce(prev, input)
        _state.value = t.state
        for (e in t.effects) runEffect(e)
        onStateChanged(prev, t.state)
    }

    private fun runEffect(e: CallEffect) {
        when (e) {
            is CallEffect.Send -> ws?.send(e.message)
            is CallEffect.StartPeer -> startPeer(e)
            is CallEffect.AddRemoteIce -> peer?.addRemoteIce(e.candidate)
            is CallEffect.ClosePeer -> closePeer()
            is CallEffect.NotifyMissed -> _events.tryEmit(EngineEvent.Missed(e.plate))
            is CallEffect.ShowAlert -> _alert.value = e.alert
            is CallEffect.DismissAlert -> { if (_alert.value?.reportId == e.reportId) _alert.value = null }
            is CallEffect.ShowIncoming, is CallEffect.DismissIncoming -> {} // notifikasi mengikuti state di CallService
        }
    }

    private fun startPeer(e: CallEffect.StartPeer) {
        closePeer()
        @Suppress("DEPRECATION")
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audio.isSpeakerphoneOn = _speaker.value
        val p = try {
            PeerSession(app, e.iceServers,
                onLocalCandidate = { c -> ws?.send(com.vehiclecontact.core.SignalOut.ice(e.callId, c)) },
                onConnected = { dispatch(CallInput.PeerConnected) },
                onFailed = { dispatch(CallInput.PeerFailed) })
        } catch (ex: Exception) { Log.e(TAG, "PeerSession gagal", ex); scope.launch { dispatch(CallInput.PeerFailed) }; return }
        p.setMuted(_muted.value)
        peer = p
        scope.launch {
            try { ws?.send(com.vehiclecontact.core.SignalOut.answer(e.callId, p.answer(e.offerSdp))) }
            catch (ex: Exception) { Log.e(TAG, "answer gagal", ex); dispatch(CallInput.PeerFailed) }
        }
    }

    private fun closePeer() {
        peer?.close(); peer = null
        runCatching {
            @Suppress("DEPRECATION")
            audio.isSpeakerphoneOn = false
            audio.mode = AudioManager.MODE_NORMAL
        }
    }

    private fun onStateChanged(prev: CallState, now: CallState) {
        if (prev::class == now::class) return
        ringTimer?.cancel(); ticker?.cancel()
        when (now) {
            is CallState.Ringing -> ringTimer = scope.launch { delay((now.ringTimeoutSec + 3) * 1000L); dispatch(CallInput.RingTimeout) }
            is CallState.Connected -> { _seconds.value = 0; ticker = scope.launch { while (isActive) { delay(1000); _seconds.value += 1 } } }
            is CallState.Ended -> scope.launch { delay(2500); dispatch(CallInput.Dismissed) }
            is CallState.Connecting -> { _muted.value = false }
            CallState.Idle -> { _muted.value = false; _speaker.value = false }
        }
    }

    companion object { private const val TAG = "VecsCall" }
}
