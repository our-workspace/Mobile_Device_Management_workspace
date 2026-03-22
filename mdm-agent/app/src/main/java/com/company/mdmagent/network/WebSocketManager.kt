package com.company.mdmagent.network

import android.content.Context
import android.util.Log
import com.company.mdmagent.utils.AgentPreferences
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * WebSocket Manager – يدير الاتصال مع Backend مع Exponential Backoff
 */
class WebSocketManager(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onMessageReceived: (IncomingMessage) -> Unit,
    private val onConnected: () -> Unit,
    private val onDisconnected: () -> Unit
) {
    companion object {
        private const val TAG = "WebSocketManager"
        private const val NORMAL_CLOSE = 1000
        private val BACKOFF_DELAYS = longArrayOf(0, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000)
    }

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        // ملاحظة: pingInterval محذوف عمداً – كان يسبب خطأ "Control frames must be final"
        // مع الـ Node.js ws server. نعتمد على الـ heartbeat كـ keep-alive بدلاً منه.
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // لا timeout للـ WebSocket
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val isConnected = AtomicBoolean(false)
    private val shouldReconnect = AtomicBoolean(true)
    private var reconnectAttempt = 0
    private var agentStartTime = System.currentTimeMillis()

    fun connect() {
        shouldReconnect.set(true)
        agentStartTime = AgentPreferences.getAgentStartTime(context)
        attemptConnect()
    }

    fun disconnect() {
        shouldReconnect.set(false)
        webSocket?.close(NORMAL_CLOSE, "Agent shutting down")
        webSocket = null
    }

    fun send(message: Any): Boolean {
        if (!isConnected.get()) {
            Log.w(TAG, "Cannot send: not connected")
            return false
        }
        return try {
            val json = gson.toJson(message)
            webSocket?.send(json) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Send error: ${e.message}")
            false
        }
    }

    private fun attemptConnect() {
        val wsUrl = AgentPreferences.getWsUrl(context)
        val authToken = AgentPreferences.getAuthToken(context)

        if (wsUrl == null || authToken == null) {
            Log.e(TAG, "Cannot connect: missing wsUrl or authToken")
            return
        }

        val delay = if (reconnectAttempt < BACKOFF_DELAYS.size)
            BACKOFF_DELAYS[reconnectAttempt]
        else
            BACKOFF_DELAYS.last()

        scope.launch(Dispatchers.IO) {
            if (delay > 0) {
                Log.d(TAG, "Reconnecting in ${delay}ms (attempt $reconnectAttempt)...")
                delay(delay)
            }

            val request = Request.Builder()
                .url(wsUrl)
                .addHeader("Authorization", "Bearer $authToken")
                .build()

            Log.d(TAG, "Connecting to $wsUrl...")
            webSocket = client.newWebSocket(request, createListener())
        }
    }

    private fun createListener(): WebSocketListener = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "WebSocket connected!")
            isConnected.set(true)
            reconnectAttempt = 0
            onConnected()
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = gson.fromJson(text, IncomingMessage::class.java)
                Log.d(TAG, "Received: ${message.type}")
                onMessageReceived(message)
            } catch (e: Exception) {
                Log.e(TAG, "Parse error: ${e.message}")
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closing: $code / $reason")
            webSocket.close(NORMAL_CLOSE, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.i(TAG, "WebSocket closed: $code / $reason")
            handleDisconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket failure: ${t.message}")
            handleDisconnect()
        }
    }

    private fun handleDisconnect() {
        isConnected.set(false)
        onDisconnected()

        if (shouldReconnect.get()) {
            reconnectAttempt++
            Log.i(TAG, "Will reconnect (attempt $reconnectAttempt)...")
            attemptConnect()
        }
    }
}
