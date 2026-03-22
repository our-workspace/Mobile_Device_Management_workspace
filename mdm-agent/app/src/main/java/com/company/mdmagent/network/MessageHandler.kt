package com.company.mdmagent.network

import android.content.Context
import android.util.Log
import com.company.mdmagent.commands.CommandDispatcher
import com.company.mdmagent.utils.AgentPreferences
import com.company.mdmagent.utils.DeviceInfoUtils
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.UUID

/**
 * MessageHandler – يعالج كل رسالة واردة من السيرفر
 */
class MessageHandler(
    private val context: Context,
    private val webSocketManager: WebSocketManager,
    private val commandDispatcher: CommandDispatcher,
    private val onHelloAck: (() -> Unit)? = null  // callback بعد استلام hello_ack
) {
    companion object {
        private const val TAG = "MessageHandler"
    }

    private val gson = Gson()

    fun handle(message: IncomingMessage) {
        Log.d(TAG, "Handling message type: ${message.type}")

        when (message.type) {
            "agent_hello_ack" -> handleHelloAck(message)
            "heartbeat_ack" -> handleHeartbeatAck(message)
            "command" -> handleCommand(message)
            "command_result_ack" -> handleCommandResultAck(message)
            "error" -> handleError(message)
            else -> Log.w(TAG, "Unknown message type: ${message.type}")
        }
    }

    private fun handleHelloAck(message: IncomingMessage) {
        try {
            val payload = map(message.payload)
            val heartbeatInterval = (payload["heartbeatIntervalSeconds"] as? Double)?.toInt() ?: 30

            // استخراج الأوامر المعلّقة
            @Suppress("UNCHECKED_CAST")
            val rawPending = payload["pendingCommands"] as? List<Map<String, Any?>> ?: emptyList()
            val pendingCommands = rawPending.map { raw ->
                PendingCommand(
                    commandId = raw["commandId"] as? String ?: "",
                    commandType = raw["commandType"] as? String ?: "",
                    priority = raw["priority"] as? String ?: "normal",
                    timeoutSeconds = (raw["timeoutSeconds"] as? Double)?.toInt() ?: 120,
                    params = raw["params"] as? Map<String, Any?> ?: emptyMap()
                )
            }.filter { it.commandId.isNotBlank() }

            Log.i(TAG, "Hello ACK received. Pending commands: ${pendingCommands.size}")

            if (pendingCommands.isNotEmpty()) {
                commandDispatcher.dispatchPending(pendingCommands)
            }

            // إبلاغ AgentService بأن المصادقة اكتملت → سيُرسل الإشعارات المخزّنة
            onHelloAck?.invoke()

        } catch (e: Exception) {
            Log.e(TAG, "Error parsing hello_ack: ${e.message}")
        }
    }

    private fun handleHeartbeatAck(message: IncomingMessage) {
        // Nothing special needed – the WebSocket manager handles ping/pong
        Log.v(TAG, "Heartbeat ACK received")
    }

    private fun handleCommand(message: IncomingMessage) {
        try {
            val payload = map(message.payload ?: return)
            val commandId = payload["commandId"] as? String ?: return
            val commandType = payload["commandType"] as? String ?: return
            @Suppress("UNCHECKED_CAST")
            val params = (payload["params"] as? Map<String, Any?>) ?: emptyMap()

            // إرسال command_ack فوراً
            val deviceUid = AgentPreferences.getDeviceUid(context) ?: return
            val ack = CommandAckMessage(
                msgId = UUID.randomUUID().toString(),
                timestamp = java.time.Instant.now().toString(),
                payload = CommandAckPayload(commandId = commandId, status = "received")
            )
            webSocketManager.send(ack)

            // تنفيذ الأمر
            commandDispatcher.dispatch(commandId, commandType, params)

        } catch (e: Exception) {
            Log.e(TAG, "Error parsing command: ${e.message}")
        }
    }

    private fun handleCommandResultAck(message: IncomingMessage) {
        val commandId = map(message.payload)["commandId"]
        Log.d(TAG, "Command result ACK: $commandId")
    }

    private fun handleError(message: IncomingMessage) {
        val payload = map(message.payload)
        val code = payload["code"] as? String ?: "UNKNOWN"
        val msg = payload["message"] as? String ?: ""
        Log.e(TAG, "Server error: $code – $msg")
    }

    private fun map(payload: Map<String, Any?>?): Map<String, Any?> = payload ?: emptyMap()
}
