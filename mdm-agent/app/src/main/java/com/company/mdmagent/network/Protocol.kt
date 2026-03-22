package com.company.mdmagent.network

import com.google.gson.annotations.SerializedName

// =====================================================================
// بروتوكول رسائل MDM – كلاسات Kotlin مقابلة للـ TypeScript interfaces
// =====================================================================

// ---- Base ----

data class BaseMessage(
    val type: String,
    @SerializedName("msgId") val msgId: String,
    val timestamp: String
)

// ---- Agent → Server ----

data class AgentHelloMessage(
    val type: String = "agent_hello",
    val msgId: String,
    val timestamp: String,
    val payload: AgentHelloPayload
)

data class AgentHelloPayload(
    val deviceUid: String,
    val authToken: String,
    val agentVersion: String,
    val lastKnownCommandId: String? = null
)

data class HeartbeatMessage(
    val type: String = "heartbeat",
    val msgId: String,
    val timestamp: String,
    val payload: HeartbeatPayload
)

data class HeartbeatPayload(
    val deviceUid: String,
    val battery: BatteryInfo,
    val network: NetworkInfo,
    val storage: StorageInfo,
    val uptime: UptimeInfo
)

data class BatteryInfo(
    val level: Int,
    val isCharging: Boolean,
    val chargingType: String?     // USB | AC | WIRELESS | null
)

data class NetworkInfo(
    val type: String,             // WIFI | MOBILE | NONE
    val isConnected: Boolean,
    val wifiSignalLevel: Int?,    // 0-5
    val mobileNetworkType: String?
)

data class StorageInfo(
    val totalBytes: Long,
    val freeBytes: Long,
    val usedPercent: Int
)

data class UptimeInfo(
    val deviceUptimeMs: Long,
    val agentUptimeMs: Long
)

data class CommandAckMessage(
    val type: String = "command_ack",
    val msgId: String,
    val timestamp: String,
    val payload: CommandAckPayload
)

data class CommandAckPayload(
    val commandId: String,
    val status: String,           // received | rejected
    val reason: String? = null
)

data class CommandResultMessage(
    val type: String = "command_result",
    val msgId: String,
    val timestamp: String,
    val payload: CommandResultPayload
)

data class CommandResultPayload(
    val commandId: String,
    val commandType: String,
    val status: String,           // success | failure | partial
    val executionTimeMs: Long,
    val result: Map<String, Any?>? = null,
    val error: CommandError? = null
)

data class CommandError(
    val code: String,
    val message: String
)

data class NotificationEventMessage(
    val type: String = "notification_event",
    val msgId: String,
    val timestamp: String,
    val payload: NotificationEventPayload
)

data class NotificationEventPayload(
    val deviceUid: String,
    val notifications: List<NotificationItem>
)

data class NotificationItem(
    val notifId: String,
    val packageName: String,
    val appName: String,
    val title: String?,
    val text: String?,
    val category: String?,
    val postedAt: String,
    val isOngoing: Boolean
)

// ---- Server → Agent ----

data class AgentHelloAckPayload(
    val pendingCommands: List<PendingCommand>,
    val heartbeatIntervalSeconds: Int
)

data class PendingCommand(
    val commandId: String,
    val commandType: String,
    val priority: String,
    val timeoutSeconds: Int,
    val params: Map<String, Any?>
)

data class HeartbeatAckPayload(
    val serverTime: String
)

data class CommandMessagePayload(
    val commandId: String,
    val commandType: String,
    val priority: String,
    val timeoutSeconds: Int,
    val params: Map<String, Any?>
)

data class ErrorPayload(
    val code: String,
    val message: String,
    val relatedMsgId: String? = null
)

// ---- Registration (HTTP) ----

data class RegisterDeviceRequest(
    val androidId: String,
    val serialNumber: String?,
    val model: String,
    val manufacturer: String,
    val androidVersion: String,
    val sdkVersion: Int,
    val agentVersion: String,
    val enrollmentToken: String
)

data class RegisterDeviceResponse(
    val deviceUid: String,
    val authToken: String,
    val wsUrl: String,
    val heartbeatIntervalSeconds: Int
)

// ---- Generic incoming message (للـ parsing) ----
data class IncomingMessage(
    val type: String,
    val msgId: String,
    val timestamp: String,
    val payload: Map<String, Any?>?
)
