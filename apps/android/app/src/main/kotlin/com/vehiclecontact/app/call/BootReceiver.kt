package com.vehiclecontact.app.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.vehiclecontact.app.vecs

/** Setelah perangkat menyala ulang / aplikasi diperbarui: aktifkan kembali mode siaga bila pemilik sudah masuk. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.vecs
        if (app.loggedIn.value && app.session.listenEnabled) CallService.start(context)
    }
}
