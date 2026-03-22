package com.company.mdmagent.collectors

import android.content.Context
import android.util.Log
import com.company.mdmagent.network.HeartbeatMessage
import com.company.mdmagent.network.HeartbeatPayload
import com.company.mdmagent.network.WebSocketManager
import com.company.mdmagent.utils.AgentPreferences
import com.company.mdmagent.utils.DeviceInfoUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

/**
 * HeartbeatCollector – يرسل نبضات دورية للسيرفر
 */
class HeartbeatCollector(
    private val context: Context,
    private val scope: CoroutineScope,
    private val webSocketManager: WebSocketManager
) {
    companion object {
        private const val TAG = "HeartbeatCollector"
    }

    private var isRunning = false

    fun start(intervalSeconds: Int = 30) {
        if (isRunning) return
        isRunning = true

        scope.launch {
            Log.i(TAG, "Heartbeat loop started (interval: ${intervalSeconds}s)")
            while (isRunning) {
                sendHeartbeat()
                delay(intervalSeconds * 1000L)
            }
        }
    }

    fun stop() {
        isRunning = false
        Log.i(TAG, "Heartbeat loop stopped")
    }

    private fun sendHeartbeat() {
        val deviceUid = AgentPreferences.getDeviceUid(context) ?: run {
            Log.w(TAG, "No deviceUid, skipping heartbeat")
            return
        }

        val agentStartTime = AgentPreferences.getAgentStartTime(context)

        val message = HeartbeatMessage(
            msgId = UUID.randomUUID().toString(),
            timestamp = Instant.now().toString(),
            payload = HeartbeatPayload(
                deviceUid = deviceUid,
                battery = DeviceInfoUtils.getBatteryInfo(context),
                network = DeviceInfoUtils.getNetworkInfo(context),
                storage = DeviceInfoUtils.getStorageInfo(),
                uptime = DeviceInfoUtils.getUptimeInfo(agentStartTime)
            )
        )

        val sent = webSocketManager.send(message)
        Log.v(TAG, "Heartbeat sent: $sent")
    }
}
