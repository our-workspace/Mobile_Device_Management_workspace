package com.company.mdmagent.commands

import android.content.Context
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.network.PendingCommand

/**
 * Interface لجميع أنواع الأوامر
 */
interface ICommand {
    val commandType: String

    /**
     * تنفيذ الأمر وإرجاع النتيجة
     */
    suspend fun execute(
        context: Context,
        commandId: String,
        params: Map<String, Any?>
    ): CommandResultPayload
}
