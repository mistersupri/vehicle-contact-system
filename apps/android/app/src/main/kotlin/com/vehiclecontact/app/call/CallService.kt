package com.vehiclecontact.app.call

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.vehiclecontact.app.vecs
import com.vehiclecontact.core.CallState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service "siaga": menjaga koneksi signaling hidup agar panggilan masuk berdering walau aplikasi
 * ditutup atau layar mati (pengganti push FCM). Menampilkan notifikasi tetap — wajib bagi layanan latar belakang Android.
 */
class CallService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var started = false
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val engine = vecs.engine
        when (intent?.action) {
            ACTION_STOP -> { engine.stop(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY }
            ACTION_REJECT -> engine.reject()
            ACTION_HANGUP -> engine.hangup()
        }
        goForeground(inCall = false, plate = "")
        engine.start()
        if (!started) { started = true; observe() }
        return START_STICKY
    }

    private fun typeFor(inCall: Boolean): Int {
        if (Build.VERSION.SDK_INT >= 34) {
            return if (inCall) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            else ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        }
        if (Build.VERSION.SDK_INT >= 30 && inCall) return ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        return 0
    }

    private fun goForeground(inCall: Boolean, plate: String) {
        val n = if (inCall) NotificationHelper.inCall(this, plate) else NotificationHelper.listening(this, listenText())
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NotificationHelper.ID_LISTEN, n, typeFor(inCall))
            else startForeground(NotificationHelper.ID_LISTEN, n)
        } catch (e: Exception) {
            // mis. tipe mikrofon ditolak dari latar belakang — jangan sampai layanan crash
            Log.e(TAG, "startForeground gagal (inCall=$inCall)", e)
            runCatching { startForeground(NotificationHelper.ID_LISTEN, NotificationHelper.listening(this, listenText())) }
        }
    }

    private fun listenText() = when (vecs.engine.connection.value) {
        Conn.ONLINE -> "Siap menerima panggilan"
        Conn.CONNECTING -> "Menyambung ke server…"
        Conn.OFFLINE -> "Offline — mencoba menyambung ulang"
    }

    private fun observe() {
        val app = vecs
        scope.launch {
            app.engine.state.collect { s ->
                val nm = getSystemService(NotificationManager::class.java)
                when (s) {
                    is CallState.Ringing -> {
                        acquireWake()
                        nm.notify(NotificationHelper.ID_CALL, NotificationHelper.incoming(this@CallService, s))
                        // bila aplikasi sedang di depan, buka langsung; bila tidak, notifikasi layar penuh yang tampil
                        runCatching { startActivity(CallActivity.intent(this@CallService).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    }
                    is CallState.Connecting -> { nm.cancel(NotificationHelper.ID_CALL); releaseWake(); goForeground(true, s.plate) }
                    is CallState.Connected -> goForeground(true, s.plate)
                    is CallState.Ended, CallState.Idle -> { nm.cancel(NotificationHelper.ID_CALL); releaseWake(); goForeground(false, "") }
                }
            }
        }
        scope.launch { app.engine.connection.collect { if (app.engine.state.value is CallState.Idle) goForeground(false, "") } }
        scope.launch { app.engine.events.collect { if (it is EngineEvent.Missed) NotificationHelper.missed(this@CallService, it.plate) } }
    }

    private fun acquireWake() {
        if (wake?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vecs:ring").apply { acquire(60_000) }
    }
    private fun releaseWake() { wake?.let { if (it.isHeld) it.release() }; wake = null }

    override fun onDestroy() { scope.cancel(); releaseWake(); super.onDestroy() }

    companion object {
        const val ACTION_STOP = "com.vehiclecontact.app.STOP"
        const val ACTION_REJECT = "com.vehiclecontact.app.REJECT"
        const val ACTION_HANGUP = "com.vehiclecontact.app.HANGUP"
        private const val TAG = "VecsService"

        fun start(ctx: Context) { runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, CallService::class.java)) } }
        fun stop(ctx: Context) { ctx.vecs.engine.stop(); ctx.stopService(Intent(ctx, CallService::class.java)) }
    }
}
