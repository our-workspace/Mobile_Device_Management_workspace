package com.company.mdmagent.commands

import android.content.Context
import android.util.Log
import com.company.mdmagent.network.CommandError
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.network.PendingCommand
import com.company.mdmagent.network.WebSocketManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * CommandDispatcher – Router للأوامر الواردة من السيرفر
 * يوجّه كل command لتنفيذه في الـ Command الصحيح
 */
class CommandDispatcher(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onResult: (CommandResultPayload) -> Unit
) {
    companion object {
        private const val TAG = "CommandDispatcher"
    }

    // سجّل هنا جميع الأوامر المتاحة (Plugin-like pattern)
    private val commands: Map<String, ICommand> = mapOf(
        "get_device_info" to GetDeviceInfoCommand(),
        "backup_sms"      to BackupSmsCommand(),
    )

    /**
     * تنفيذ أمر واحد
     */
    fun dispatch(commandId: String, commandType: String, params: Map<String, Any?>) {
        val command = commands[commandType]

        if (command == null) {
            Log.w(TAG, "Unknown command type: $commandType")
            onResult(
                CommandResultPayload(
                    commandId = commandId,
                    commandType = commandType,
                    status = "failure",
                    executionTimeMs = 0,
                    error = CommandError(
                        code = "UNKNOWN_COMMAND",
                        message = "Command type '$commandType' is not supported"
                    )
                )
            )
            return
        }

        Log.i(TAG, "Executing command: $commandType (id=$commandId)")

        scope.launch {
            try {
                val result = command.execute(context, commandId, params)
                Log.i(TAG, "Command completed: $commandType → ${result.status}")
                onResult(result)
            } catch (e: Exception) {
                Log.e(TAG, "Command failed: $commandType", e)
                onResult(
                    CommandResultPayload(
                        commandId = commandId,
                        commandType = commandType,
                        status = "failure",
                        executionTimeMs = 0,
                        error = CommandError(code = "UNEXPECTED_ERROR", message = e.message ?: "Unexpected error")
                    )
                )
            }
        }
    }

    /**
     * تنفيذ قائمة من الأوامر المعلّقة (من pendingCommands في hello_ack)
     */
    fun dispatchPending(pendingCommands: List<PendingCommand>) {
        pendingCommands.forEach { cmd ->
            Log.i(TAG, "Dispatching pending command: ${cmd.commandType}")
            dispatch(cmd.commandId, cmd.commandType, cmd.params)
        }
    }
}
