package com.company.mdmagent.commands

import android.content.Context
import android.util.Log
import com.company.mdmagent.network.ApiClient
import com.company.mdmagent.network.CommandError
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.utils.AgentPreferences
import java.io.File

/**
 * PullFileCommand - يرفع ملفاً من ذاكرة الجهاز إلى السيرفر
 *
 * params المدعومة:
 *   - filePath: String (المسار الكامل للملف المطلوب)
 */
class PullFileCommand : ICommand {

    override val commandType = "pull_file"

    companion object {
        private const val TAG = "PullFileCommand"
    }

    override suspend fun execute(
        context: Context,
        commandId: String,
        params: Map<String, Any?>
    ): CommandResultPayload {
        val startTime = System.currentTimeMillis()

        return try {
            val filePath = params["filePath"] as? String
            if (filePath.isNullOrBlank()) {
                return failResult(commandId, "MISSING_PARAM", "Parameter 'filePath' is required", startTime)
            }

            Log.i(TAG, "Pulling file: $filePath")
            val file = File(filePath)

            if (!file.exists()) {
                return failResult(commandId, "NOT_FOUND", "File does not exist: $filePath", startTime)
            }
            if (file.isDirectory) {
                return failResult(commandId, "IS_DIRECTORY", "Requested path is a directory, not a file: $filePath", startTime)
            }
            if (!file.canRead()) {
                return failResult(commandId, "PERMISSION_DENIED", "Cannot read file: $filePath", startTime)
            }

            // رفع الملف
            val deviceUid = AgentPreferences.getDeviceUid(context)
                ?: return failResult(commandId, "DEVICE_UID_MISSING", "Device UID not found", startTime)

            // دالة رفع الملف للبيكند (سنقوم بإنشائها)
            val fileKey = ApiClient.uploadGenericFile(
                context = context,
                deviceUid = deviceUid,
                commandId = commandId,
                file = file
            )

            CommandResultPayload(
                commandId = commandId,
                commandType = commandType,
                status = "success",
                executionTimeMs = System.currentTimeMillis() - startTime,
                result = mapOf(
                    "uploadedFileKey" to fileKey,
                    "originalPath" to filePath,
                    "sizeBytes" to file.length()
                )
            )

        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied: ${e.message}")
            failResult(commandId, "PERMISSION_DENIED", "Storage permission is not granted: ${e.message}", startTime)
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error: ${e.message}", e)
            failResult(commandId, "EXECUTION_ERROR", e.message ?: "Unknown error", startTime)
        }
    }

    private fun failResult(
        commandId: String,
        code: String,
        message: String,
        startTime: Long
    ) = CommandResultPayload(
        commandId = commandId,
        commandType = commandType,
        status = "failure",
        executionTimeMs = System.currentTimeMillis() - startTime,
        error = CommandError(code = code, message = message)
    )
}
