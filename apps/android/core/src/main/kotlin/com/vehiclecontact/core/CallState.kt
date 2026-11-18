package com.vehiclecontact.core

/** Status panggilan di sisi pemilik. */
sealed interface CallState {
    data object Idle : CallState
    data class Ringing(val callId: String, val plate: String, val reference: String, val ringTimeoutSec: Int, val vehicleName: String? = null) : CallState
    data class Connecting(val callId: String, val plate: String, val vehicleName: String? = null) : CallState
    data class Connected(val callId: String, val plate: String, val vehicleName: String? = null) : CallState
    data class Ended(val message: String) : CallState
}

/** Efek samping yang harus dijalankan lapisan platform setelah transisi. */
sealed interface CallEffect {
    data class Send(val message: String) : CallEffect
    data class StartPeer(val callId: String, val offerSdp: String, val iceServers: List<IceServerInfo>) : CallEffect
    data class AddRemoteIce(val candidate: IceCandidateInfo) : CallEffect
    data class ShowIncoming(val state: CallState.Ringing) : CallEffect
    data class ShowAlert(val alert: SignalEvent.Alert) : CallEffect
    data class DismissAlert(val reportId: String) : CallEffect
    data class DismissIncoming(val callId: String) : CallEffect
    data object ClosePeer : CallEffect
    data class NotifyMissed(val plate: String) : CallEffect
}

sealed interface CallInput {
    data class Signal(val event: SignalEvent) : CallInput
    data object UserAccept : CallInput
    data object UserReject : CallInput
    data object UserHangup : CallInput
    data object PeerConnected : CallInput
    data object PeerFailed : CallInput
    data object RingTimeout : CallInput
    data object Dismissed : CallInput // UI menutup layar "Ended"
}

data class Transition(val state: CallState, val effects: List<CallEffect> = emptyList())

/** Reducer murni (tanpa Android) agar logika panggilan bisa diuji di JVM. */
object CallReducer {
    private fun activeId(s: CallState) = when (s) {
        is CallState.Ringing -> s.callId; is CallState.Connecting -> s.callId; is CallState.Connected -> s.callId; else -> null
    }

    fun reduce(s: CallState, input: CallInput): Transition = when (input) {
        is CallInput.Signal -> signal(s, input.event)

        CallInput.UserAccept -> if (s is CallState.Ringing)
            Transition(CallState.Connecting(s.callId, s.plate, s.vehicleName), listOf(CallEffect.Send(SignalOut.accept(s.callId)), CallEffect.DismissIncoming(s.callId)))
        else Transition(s)

        CallInput.UserReject -> if (s is CallState.Ringing)
            Transition(CallState.Idle, listOf(CallEffect.Send(SignalOut.reject(s.callId)), CallEffect.DismissIncoming(s.callId)))
        else Transition(s)

        CallInput.UserHangup -> when (s) {
            is CallState.Connecting -> Transition(CallState.Ended("Panggilan diakhiri"), listOf(CallEffect.Send(SignalOut.end(s.callId)), CallEffect.ClosePeer))
            is CallState.Connected -> Transition(CallState.Ended("Panggilan selesai"), listOf(CallEffect.Send(SignalOut.end(s.callId)), CallEffect.ClosePeer))
            else -> Transition(s)
        }

        CallInput.PeerConnected -> if (s is CallState.Connecting) Transition(CallState.Connected(s.callId, s.plate, s.vehicleName)) else Transition(s)

        CallInput.PeerFailed -> when (s) {
            is CallState.Connecting -> Transition(CallState.Ended("Koneksi audio gagal tersambung"), listOf(CallEffect.Send(SignalOut.end(s.callId)), CallEffect.ClosePeer))
            is CallState.Connected -> Transition(CallState.Ended("Koneksi terputus"), listOf(CallEffect.Send(SignalOut.end(s.callId)), CallEffect.ClosePeer))
            else -> Transition(s)
        }

        CallInput.RingTimeout -> if (s is CallState.Ringing) Transition(CallState.Idle, listOf(CallEffect.DismissIncoming(s.callId))) else Transition(s)

        CallInput.Dismissed -> if (s is CallState.Ended) Transition(CallState.Idle) else Transition(s)
    }

    private fun signal(s: CallState, e: SignalEvent): Transition = when (e) {
        is SignalEvent.Invite -> when {
            // sudah ada panggilan lain: tolak otomatis, jangan mengganggu panggilan berjalan
            s is CallState.Ringing || s is CallState.Connecting || s is CallState.Connected ->
                if (activeId(s) == e.callId) Transition(s) else Transition(s, listOf(CallEffect.Send(SignalOut.reject(e.callId))))
            else -> CallState.Ringing(e.callId, e.plate, e.reference, e.ringTimeoutSec, e.vehicleName).let { Transition(it, listOf(CallEffect.ShowIncoming(it))) }
        }

        is SignalEvent.Cancelled -> when {
            s is CallState.Ringing && s.callId == e.callId ->
                Transition(CallState.Idle, listOf(CallEffect.DismissIncoming(e.callId), CallEffect.NotifyMissed(s.plate)))
            else -> Transition(s)
        }

        // "call:taken" juga dikirim ke soket kita sendiri setelah menerima — abaikan; untuk perangkat lain, tutup dering
        is SignalEvent.Taken -> if (s is CallState.Ringing && s.callId == e.callId) Transition(CallState.Idle, listOf(CallEffect.DismissIncoming(e.callId))) else Transition(s)

        is SignalEvent.Offer -> if (s is CallState.Connecting && s.callId == e.callId) Transition(s, listOf(CallEffect.StartPeer(e.callId, e.sdp, e.iceServers))) else Transition(s)

        is SignalEvent.Ice -> if ((s is CallState.Connecting || s is CallState.Connected) && activeId(s) == e.callId) Transition(s, listOf(CallEffect.AddRemoteIce(e.candidate))) else Transition(s)

        is SignalEvent.End -> when {
            (s is CallState.Connecting || s is CallState.Connected) && activeId(s) == e.callId -> Transition(CallState.Ended("Panggilan berakhir"), listOf(CallEffect.ClosePeer))
            else -> Transition(s)
        }

        is SignalEvent.Error -> when (s) {
            is CallState.Connecting, is CallState.Connected -> Transition(CallState.Ended("Panggilan terputus"), listOf(CallEffect.ClosePeer))
            else -> Transition(s)
        }

        // Alert tidak mengubah status panggilan: hanya efek tampil/tutup
        is SignalEvent.Alert -> Transition(s, listOf(CallEffect.ShowAlert(e)))
        is SignalEvent.AlertDismiss -> Transition(s, listOf(CallEffect.DismissAlert(e.reportId)))

        SignalEvent.Hello, is SignalEvent.Unknown -> Transition(s)
    }
}
