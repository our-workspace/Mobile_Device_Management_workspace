package com.company.mdmagent.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BootReceiver – يُعيد تشغيل الـ Agent تلقائياً بعد إعادة تشغيل الجهاز
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received broadcast: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Log.i(TAG, "Starting AgentService after boot/update...")
                AgentService.start(context)
            }
        }
    }
}
