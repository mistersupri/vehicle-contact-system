package com.vehiclecontact.app.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.vehiclecontact.app.MainActivity
import com.vehiclecontact.app.R
import com.vehiclecontact.core.CallState

object NotificationHelper {
    const val CH_LISTEN = "listen"
    const val CH_CALLS = "calls"
    const val CH_MISSED = "missed"
    const val ID_LISTEN = 1
    const val ID_CALL = 2
    const val ID_MISSED = 3

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_LISTEN, "Siaga panggilan", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Notifikasi tetap yang menandakan aplikasi siap menerima panggilan"; setShowBadge(false)
        })
        nm.createNotificationChannel(NotificationChannel(CH_CALLS, "Panggilan masuk", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Panggilan dari pemindai QR kendaraan Anda"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            enableVibration(true); vibrationPattern = longArrayOf(0, 600, 400, 600, 400)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
        })
        nm.createNotificationChannel(NotificationChannel(CH_MISSED, "Panggilan tak terjawab", NotificationManager.IMPORTANCE_DEFAULT))
    }

    private fun immutable() = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

    private fun openApp(ctx: Context) =
        PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), immutable())

    fun listening(ctx: Context, text: String): Notification =
        NotificationCompat.Builder(ctx, CH_LISTEN)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Vehicle Contact")
            .setContentText(text)
            .setOngoing(true).setShowWhen(false).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openApp(ctx))
            .build()

    /** Notifikasi layar penuh: muncul di atas layar kunci dan menyalakan layar (izin USE_FULL_SCREEN_INTENT). */
    fun incoming(ctx: Context, r: CallState.Ringing): Notification {
        val full = PendingIntent.getActivity(ctx, 10, CallActivity.intent(ctx), immutable())
        val accept = PendingIntent.getActivity(ctx, 11, CallActivity.intent(ctx, accept = true), immutable())
        val reject = PendingIntent.getService(ctx, 12, Intent(ctx, CallService::class.java).setAction(CallService.ACTION_REJECT), immutable())
        val n = NotificationCompat.Builder(ctx, CH_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Panggilan masuk")
            .setContentText("QR kendaraan ${r.plate} menghubungi Anda")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true).setAutoCancel(false)
            .setTimeoutAfter((r.ringTimeoutSec + 3) * 1000L)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
            .addAction(0, "Tolak", reject)
            .addAction(0, "Terima", accept)
            .build()
        n.flags = n.flags or Notification.FLAG_INSISTENT // nada dering berulang sampai dijawab/ditutup
        return n
    }

    fun inCall(ctx: Context, plate: String): Notification =
        NotificationCompat.Builder(ctx, CH_LISTEN)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Panggilan berlangsung")
            .setContentText("QR kendaraan $plate")
            .setOngoing(true).setSilent(true).setUsesChronometer(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(PendingIntent.getActivity(ctx, 13, CallActivity.intent(ctx), immutable()))
            .addAction(0, "Akhiri", PendingIntent.getService(ctx, 14, Intent(ctx, CallService::class.java).setAction(CallService.ACTION_HANGUP), immutable()))
            .build()

    fun missed(ctx: Context, plate: String) {
        val n = NotificationCompat.Builder(ctx, CH_MISSED)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Panggilan tak terjawab")
            .setContentText("QR kendaraan $plate mencoba menghubungi Anda")
            .setAutoCancel(true).setContentIntent(openApp(ctx))
            .build()
        runCatching { ctx.getSystemService(NotificationManager::class.java).notify(ID_MISSED, n) }
    }
}
