package com.company.mdmagent.collectors

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.company.mdmagent.network.NotificationItem
import java.time.Instant
import java.util.UUID

/**
 * NotificationListener – يلتقط الإشعارات الواردة إلى الجهاز بدون Polling.
 * يعمل Production-Ready ومتوافق مع Android 8 حتى 14.
 */
class NotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "NotificationListener"

        // Callback يُستخدم في AgentService لاستقبال الإشعارات في طابور الإرسال
        var onNotificationPostedCallback: ((NotificationItem) -> Unit)? = null
        var onNotificationRemovedCallback: ((String) -> Unit)? = null
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected to OS successfully.")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected from OS!")
        // في Android 13+ يجب الحذر، قد يوقف المستخدم الخدمة وتستدعى هذه الدالة.
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        try {
            val notification = sbn.notification
            val extras = notification.extras ?: return

            val packageName = sbn.packageName
            // تجاهل الحزم التي تسبب ضوضاء أو الخاصة بالنظام والعميل نفسه
            if (packageName == applicationContext.packageName || packageName == "android") return

            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            
            // قراءة النص العادي
            var text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            
            // محاولة قراءة النص الكبير (BIG_TEXT) إذا وُجد لأنه يحوي التفاصيل الكاملة
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            if (!bigText.isNullOrBlank()) {
                text = bigText
            }

            val appName = getAppName(packageName)
            val category = notification.category
            val isOngoing = (notification.flags and Notification.FLAG_ONGOING_EVENT) != 0

            // إذا أردنا السماح بوضع خصوصية من السيرفر، يمكننا إرسال null للـ title/text
            // ولكن حالياً نرسلها كاملة.

            val item = NotificationItem(
                notifId = UUID.randomUUID().toString(),
                packageName = packageName,
                appName = appName,
                title = title,
                text = text,
                category = category,
                postedAt = Instant.ofEpochMilli(sbn.postTime).toString(),
                isOngoing = isOngoing
            )

            Log.d(TAG, "Posted: [$appName] $title")
            onNotificationPostedCallback?.invoke(item)

        } catch (e: Exception) {
            Log.e(TAG, "Error processing notification: ${e.message}")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        if (sbn == null) return
        
        // نحتفظ بها لو احتجنا مستقبلاً تتبع الإشعارات التي أُغلقت
        onNotificationRemovedCallback?.invoke(sbn.key)
    }

    private fun getAppName(packageName: String): String {
        return try {
            val pm = packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
            packageName
        }
    }
}
