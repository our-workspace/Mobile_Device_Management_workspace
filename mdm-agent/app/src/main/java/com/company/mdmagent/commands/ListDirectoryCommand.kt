package com.company.mdmagent.commands

import android.content.Context
import android.os.Environment
import android.util.Log
import com.company.mdmagent.network.CommandError
import com.company.mdmagent.network.CommandResultPayload
import java.io.File
import java.util.Date

/**
 * ListDirectoryCommand - يقرأ محتويات مجلد معين ويرجع قائمة بالملفات.
 *
 * params المدعومة:
 *   - path: String? (مسار المجلد. إذا لم يُرسل يتم استخدام root التخزين الخارجي)
 */
class ListDirectoryCommand : ICommand {

    override val commandType = "list_directory"

    companion object {
        private const val TAG = "ListDirCommand"
    }

    override suspend fun execute(
        context: Context,
        commandId: String,
        params: Map<String, Any?>
    ): CommandResultPayload {
        val startTime = System.currentTimeMillis()

        return try {
            val requestedPath = params["path"] as? String
            
            // تحديد مسار المجلد الافتراضي (التخزين الخارجي الرئيسي للجهاز /sdcard/)
            val rootDir = Environment.getExternalStorageDirectory()
            val directory = if (!requestedPath.isNullOrBlank()) {
                File(requestedPath)
            } else {
                rootDir
            }

            Log.i(TAG, "Listing directory: ${directory.absolutePath}")

            if (!directory.exists()) {
                return failResult(commandId, "NOT_FOUND", "Directory does not exist: ${directory.absolutePath}", startTime)
            }

            if (!directory.isDirectory) {
                return failResult(commandId, "NOT_A_DIRECTORY", "Path is not a directory: ${directory.absolutePath}", startTime)
            }

            if (!directory.canRead()) {
                return failResult(commandId, "PERMISSION_DENIED", "Cannot read directory: ${directory.absolutePath}. Check permissions.", startTime)
            }

            val filesList = mutableListOf<Map<String, Any>>()
            
            directory.listFiles()?.forEach { file ->
                filesList.add(mapOf(
                    "name" to file.name,
                    "absolutePath" to file.absolutePath,
                    "isDirectory" to file.isDirectory,
                    "sizeBytes" to if (file.isDirectory) 0L else file.length(),
                    "lastModifiedMs" to file.lastModified(),
                    "lastModified" to Date(file.lastModified()).toString()
                ))
            } ?: run {
                Log.w(TAG, "listFiles() returned null for ${directory.absolutePath}")
            }

            // ترتيب القائمة: المجلدات أولاً ثم الملفات، أبجدياً
            val sortedFiles = filesList.sortedWith(compareBy({ !(it["isDirectory"] as Boolean) }, { (it["name"] as String).lowercase() }))

            CommandResultPayload(
                commandId = commandId,
                commandType = commandType,
                status = "success",
                executionTimeMs = System.currentTimeMillis() - startTime,
                result = mapOf(
                    "currentPath" to directory.absolutePath,
                    "files" to sortedFiles,
                    "totalCount" to sortedFiles.size
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
