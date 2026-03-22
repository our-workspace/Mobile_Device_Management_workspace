package com.company.mdmagent.commands

import android.content.Context
import android.util.Log
import com.company.mdmagent.network.CommandError
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.utils.DeviceInfoUtils

/**
 * تنفيذ أمر get_device_info
 */
class GetDeviceInfoCommand : ICommand {

    override val commandType = "get_device_info"

    override suspend fun execute(
        context: Context,
        commandId: String,
        params: Map<String, Any?>
    ): CommandResultPayload {
        val startTime = System.currentTimeMillis()

        return try {
            val deviceInfo = DeviceInfoUtils.getFullDeviceInfo(context)

            CommandResultPayload(
                commandId = commandId,
                commandType = commandType,
                status = "success",
                executionTimeMs = System.currentTimeMillis() - startTime,
                result = mapOf("deviceInfo" to deviceInfo)
            )
        } catch (e: Exception) {
            Log.e("GetDeviceInfoCmd", "Error: ${e.message}")
            CommandResultPayload(
                commandId = commandId,
                commandType = commandType,
                status = "failure",
                executionTimeMs = System.currentTimeMillis() - startTime,
                error = CommandError(code = "EXECUTION_ERROR", message = e.message ?: "Unknown error")
            )
        }
    }
}
