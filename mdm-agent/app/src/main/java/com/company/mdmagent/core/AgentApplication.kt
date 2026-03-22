package com.company.mdmagent.core

import android.app.Application
import android.util.Log

/**
 * Application class – نقطة التشغيل الأولى
 */
class AgentApplication : Application() {

    companion object {
        private const val TAG = "AgentApplication"
        lateinit var instance: AgentApplication
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "MDM Agent Application started")

        // بدء الخدمة الرئيسية
        AgentService.start(this)
    }
}
