package com.vehiclecontact.app.call

import android.content.Context
import com.vehiclecontact.core.IceCandidateInfo
import com.vehiclecontact.core.IceServerInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Satu sesi WebRTC audio (sisi pemilik = penjawab). Audio langsung antar-perangkat lewat STUN/TURN, bukan lewat WebSocket. */
class PeerSession(
    ctx: Context,
    iceServers: List<IceServerInfo>,
    private val onLocalCandidate: (IceCandidateInfo) -> Unit,
    private val onConnected: () -> Unit,
    private val onFailed: () -> Unit,
) {
    companion object {
        @Volatile private var factory: PeerConnectionFactory? = null
        private fun factory(ctx: Context): PeerConnectionFactory = factory ?: synchronized(this) {
            factory ?: run {
                PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(ctx.applicationContext).createInitializationOptions())
                PeerConnectionFactory.builder().createPeerConnectionFactory().also { factory = it }
            }
        }
    }

    private val f = factory(ctx)
    private val audioSource = f.createAudioSource(MediaConstraints())
    private val audioTrack: AudioTrack = f.createAudioTrack("vecs-audio", audioSource)
    private val pending = mutableListOf<IceCandidateInfo>()
    @Volatile private var remoteSet = false
    @Volatile private var closed = false

    private val pc: PeerConnection = run {
        val servers = iceServers.map {
            PeerConnection.IceServer.builder(it.urls).apply { it.username?.let { u -> setUsername(u) }; it.credential?.let { p -> setPassword(p) } }.createIceServer()
        }
        val cfg = PeerConnection.RTCConfiguration(servers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        f.createPeerConnection(cfg, object : PeerConnection.Observer {
            override fun onSignalingChange(s: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(s: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(b: Boolean) {}
            override fun onIceGatheringChange(s: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidate(c: IceCandidate) { onLocalCandidate(IceCandidateInfo(c.sdp, c.sdpMid, c.sdpMLineIndex)) }
            override fun onIceCandidatesRemoved(c: Array<out IceCandidate>?) {}
            override fun onAddStream(s: MediaStream?) {}
            override fun onRemoveStream(s: MediaStream?) {}
            override fun onDataChannel(d: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(r: RtpReceiver?, s: Array<out MediaStream>?) {}
            override fun onConnectionChange(s: PeerConnection.PeerConnectionState?) {
                if (closed) return
                when (s) {
                    PeerConnection.PeerConnectionState.CONNECTED -> onConnected()
                    PeerConnection.PeerConnectionState.FAILED -> onFailed()
                    else -> {}
                }
            }
        }) ?: error("PeerConnection gagal dibuat")
    }

    init { pc.addTrack(audioTrack, listOf("vecs-stream")) }

    private class Obs(val onOk: (SessionDescription?) -> Unit, val onErr: (String) -> Unit) : SdpObserver {
        override fun onCreateSuccess(d: SessionDescription?) = onOk(d)
        override fun onSetSuccess() = onOk(null)
        override fun onCreateFailure(e: String?) = onErr(e ?: "create gagal")
        override fun onSetFailure(e: String?) = onErr(e ?: "set gagal")
    }

    private suspend fun setRemote(sdp: SessionDescription) = suspendCancellableCoroutine<Unit> { c ->
        pc.setRemoteDescription(Obs({ c.resume(Unit) }, { c.resumeWithException(IllegalStateException(it)) }), sdp)
    }
    private suspend fun createAnswer(): SessionDescription = suspendCancellableCoroutine { c ->
        pc.createAnswer(Obs({ d -> if (d != null) c.resume(d) }, { c.resumeWithException(IllegalStateException(it)) }), MediaConstraints())
    }
    private suspend fun setLocal(sdp: SessionDescription) = suspendCancellableCoroutine<Unit> { c ->
        pc.setLocalDescription(Obs({ c.resume(Unit) }, { c.resumeWithException(IllegalStateException(it)) }), sdp)
    }

    /** Terapkan offer penelepon, buat answer, kembalikan SDP answer untuk dikirim lewat signaling. */
    suspend fun answer(offerSdp: String): String {
        setRemote(SessionDescription(SessionDescription.Type.OFFER, offerSdp))
        remoteSet = true
        synchronized(pending) { pending.forEach { add(it) }; pending.clear() }
        val ans = createAnswer()
        setLocal(ans)
        return ans.description
    }

    private fun add(c: IceCandidateInfo) { pc.addIceCandidate(IceCandidate(c.sdpMid, c.sdpMLineIndex, c.candidate)) }

    fun addRemoteIce(c: IceCandidateInfo) {
        if (closed) return
        if (remoteSet) add(c) else synchronized(pending) { if (remoteSet) add(c) else pending += c }
    }

    fun setMuted(muted: Boolean) { audioTrack.setEnabled(!muted) }

    fun close() {
        if (closed) return
        closed = true
        runCatching { pc.close() }; runCatching { pc.dispose() }
        runCatching { audioTrack.dispose() }; runCatching { audioSource.dispose() }
    }
}
