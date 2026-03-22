package com.company.mdmagent.commands

import android.content.Context
import android.database.Cursor
import android.provider.Telephony
import android.util.Log
import com.company.mdmagent.network.ApiClient
import com.company.mdmagent.network.CommandError
import com.company.mdmagent.network.CommandResultPayload
import com.company.mdmagent.utils.AgentPreferences

/**
 * BackupSmsCommand – يقرأ رسائل SMS من الجهاز ويرفعها للسيرفر
 *
 * params المدعومة:
 *   - includeRead: Boolean (افتراضي: true) – هل تضمين الرسائل المقروءة؟
 *   - dateFrom: String? (ISO date) – من تاريخ معيّن، null = كل الرسائل
 *   - dateTo: String? (ISO date) – حتى تاريخ معيّن، null = حتى الآن
 */
class BackupSmsCommand : ICommand {

    override val commandType = "backup_sms"

    companion object {
        private const val TAG = "BackupSmsCommand"

        // أنواع SMS المعروفة
        private val SMS_TYPE_LABELS = mapOf(
            Telephony.Sms.MESSAGE_TYPE_INBOX  to "inbox",
            Telephony.Sms.MESSAGE_TYPE_SENT   to "sent",
            Telephony.Sms.MESSAGE_TYPE_DRAFT  to "draft",
            Telephony.Sms.MESSAGE_TYPE_OUTBOX to "outbox",
            Telephony.Sms.MESSAGE_TYPE_FAILED to "failed",
            Telephony.Sms.MESSAGE_TYPE_QUEUED to "queued"
        )
    }

    override suspend fun execute(
        context: Context,
        commandId: String,
        params: Map<String, Any?>
    ): CommandResultPayload {
        val startTime = System.currentTimeMillis()

        return try {
            // ---- استخراج الـ params ----
            val includeRead = params["includeRead"] as? Boolean ?: true
            val dateFromStr = params["dateFrom"] as? String
            val dateToStr   = params["dateTo"]   as? String

            // تحويل التواريخ إلى milliseconds
            val dateFromMs = dateFromStr?.let { parseIsoDateToMs(it) }
            val dateToMs   = dateToStr?.let   { parseIsoDateToMs(it) }

            Log.i(TAG, "Reading SMS (includeRead=$includeRead, dateFrom=$dateFromStr, dateTo=$dateToStr)")

            // ---- قراءة الرسائل ----
            val messages = readSmsMessages(context, includeRead, dateFromMs, dateToMs)

            Log.i(TAG, "Read ${messages.size} SMS messages")

            // ---- رفع إلى السيرفر ----
            val deviceUid = AgentPreferences.getDeviceUid(context)
                ?: return failResult(commandId, "DEVICE_UID_MISSING", "Device UID not found", startTime)

            val fileKey = ApiClient.uploadSmsBackup(
                context  = context,
                deviceUid = deviceUid,
                commandId = commandId,
                messages  = messages
            )

            Log.i(TAG, "SMS backup uploaded: $fileKey")

            CommandResultPayload(
                commandId       = commandId,
                commandType     = commandType,
                status          = "success",
                executionTimeMs = System.currentTimeMillis() - startTime,
                result = mapOf(
                    "totalMessages"   to messages.size,
                    "uploadedFileKey" to fileKey
                )
            )

        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied: ${e.message}")
            failResult(commandId, "PERMISSION_DENIED",
                "READ_SMS permission is not granted: ${e.message}", startTime)

        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error: ${e.message}", e)
            failResult(commandId, "EXECUTION_ERROR", e.message ?: "Unknown error", startTime)
        }
    }

    // ---- قراءة رسائل SMS من ContentResolver ----
    private fun readSmsMessages(
        context: Context,
        includeRead: Boolean,
        dateFromMs: Long?,
        dateToMs: Long?
    ): List<Map<String, Any?>> {

        val uri = Telephony.Sms.CONTENT_URI

        // بناء شرط الاستعلام
        val selectionParts = mutableListOf<String>()
        val selectionArgs  = mutableListOf<String>()

        if (!includeRead) {
            selectionParts.add("${Telephony.Sms.READ} = ?")
            selectionArgs.add("0")
        }
        if (dateFromMs != null) {
            selectionParts.add("${Telephony.Sms.DATE} >= ?")
            selectionArgs.add(dateFromMs.toString())
        }
        if (dateToMs != null) {
            selectionParts.add("${Telephony.Sms.DATE} <= ?")
            selectionArgs.add(dateToMs.toString())
        }

        val selection = if (selectionParts.isEmpty()) null else selectionParts.joinToString(" AND ")
        val args      = if (selectionArgs.isEmpty()) null else selectionArgs.toTypedArray()

        val messages = mutableListOf<Map<String, Any?>>()

        val cursor: Cursor? = context.contentResolver.query(
            uri,
            arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE,
                Telephony.Sms.READ,
                Telephony.Sms.THREAD_ID,
                Telephony.Sms.SUBJECT
            ),
            selection,
            args,
            "${Telephony.Sms.DATE} DESC"
        )

        cursor?.use {
            val idxId       = it.getColumnIndex(Telephony.Sms._ID)
            val idxAddress  = it.getColumnIndex(Telephony.Sms.ADDRESS)
            val idxBody     = it.getColumnIndex(Telephony.Sms.BODY)
            val idxDate     = it.getColumnIndex(Telephony.Sms.DATE)
            val idxType     = it.getColumnIndex(Telephony.Sms.TYPE)
            val idxRead     = it.getColumnIndex(Telephony.Sms.READ)
            val idxThread   = it.getColumnIndex(Telephony.Sms.THREAD_ID)
            val idxSubject  = it.getColumnIndex(Telephony.Sms.SUBJECT)

            while (it.moveToNext()) {
                val typeInt = if (idxType >= 0) it.getInt(idxType) else 1
                val dateMs  = if (idxDate >= 0) it.getLong(idxDate) else 0L

                messages.add(mapOf(
                    "id"       to if (idxId >= 0) it.getString(idxId) else null,
                    "address"  to if (idxAddress >= 0) it.getString(idxAddress) else null,
                    "body"     to if (idxBody >= 0) it.getString(idxBody) else null,
                    "date"     to java.time.Instant.ofEpochMilli(dateMs).toString(),
                    "dateMs"   to dateMs,
                    "type"     to (SMS_TYPE_LABELS[typeInt] ?: "unknown"),
                    "read"     to ((if (idxRead >= 0) it.getInt(idxRead) else 1) == 1),
                    "threadId" to if (idxThread >= 0) it.getString(idxThread) else null,
                    "subject"  to if (idxSubject >= 0) it.getString(idxSubject) else null
                ))
            }
        }

        return messages
    }

    // ---- تحويل تاريخ ISO إلى milliseconds ----
    private fun parseIsoDateToMs(dateStr: String): Long? {
        return try {
            // يقبل "2026-01-01" أو "2026-01-01T00:00:00Z"
            val normalised = if (dateStr.length == 10) "${dateStr}T00:00:00Z" else dateStr
            java.time.Instant.parse(normalised).toEpochMilli()
        } catch (e: Exception) {
            Log.w(TAG, "Cannot parse date: $dateStr")
            null
        }
    }

    // ---- مساعد لإرجاع نتيجة فاشلة ----
    private fun failResult(
        commandId: String,
        code: String,
        message: String,
        startTime: Long
    ) = CommandResultPayload(
        commandId       = commandId,
        commandType     = commandType,
        status          = "failure",
        executionTimeMs = System.currentTimeMillis() - startTime,
        error           = CommandError(code = code, message = message)
    )
}
