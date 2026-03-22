package com.company.mdmagent.network

import android.content.Context
import android.util.Log
import com.company.mdmagent.utils.AgentPreferences
import com.company.mdmagent.utils.DeviceInfoUtils
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * HTTP Client للتسجيل الأولي ورفع الملفات مع Backend
 */
object ApiClient {

    private const val TAG = "ApiClient"

    private const val BASE_URL = "http://192.168.1.34:3000"
    private const val ENROLLMENT_TOKEN = "MRyUnSbxOmMeDeSbJty7mS3Sj3yvBsh4wHl/31f6/gc="

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)  // رفع الملفات قد يستغرق وقتاً
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    // ---- تسجيل الجهاز ----
    suspend fun registerDevice(context: Context): RegisterDeviceResponse {
        return withContext(Dispatchers.IO) {
            val requestBody = RegisterDeviceRequest(
                androidId = DeviceInfoUtils.getAndroidId(context),
                serialNumber = DeviceInfoUtils.getSerial(),
                model = android.os.Build.MODEL,
                manufacturer = android.os.Build.MANUFACTURER,
                androidVersion = android.os.Build.VERSION.RELEASE,
                sdkVersion = android.os.Build.VERSION.SDK_INT,
                agentVersion = "1.0.0",
                enrollmentToken = ENROLLMENT_TOKEN
            )

            val json = gson.toJson(requestBody)
            val body = json.toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url("$BASE_URL/api/v1/devices/register")
                .post(body)
                .build()

            Log.d(TAG, "Registering device with server...")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw Exception("Empty response from server")

            if (!response.isSuccessful) {
                Log.e(TAG, "Registration failed: ${response.code} / $responseBody")
                throw Exception("Registration failed: ${response.code}")
            }

            val result = gson.fromJson(responseBody, RegisterDeviceResponse::class.java)
            Log.i(TAG, "Registration successful! deviceUid = ${result.deviceUid}")
            result
        }
    }

    // ---- رفع نسخة احتياطية من SMS ----
    /**
     * يرفع قائمة رسائل SMS كملف JSON إلى Backend.
     * @return fileKey – مسار الملف المحفوظ على السيرفر
     */
    suspend fun uploadSmsBackup(
        context: Context,
        deviceUid: String,
        commandId: String,
        messages: List<Map<String, Any?>>
    ): String {
        return withContext(Dispatchers.IO) {
            val authToken = AgentPreferences.getAuthToken(context)
                ?: throw Exception("Auth token not found")

            // تحويل الرسائل إلى JSON
            val payload = mapOf(
                "deviceUid"  to deviceUid,
                "commandId"  to commandId,
                "fileType"   to "sms",
                "totalCount" to messages.size,
                "messages"   to messages
            )
            val json = gson.toJson(payload)
            val body = json.toRequestBody("application/json".toMediaType())

            Log.d(TAG, "Uploading ${messages.size} SMS messages to server...")

            val request = Request.Builder()
                .url("$BASE_URL/api/v1/devices/$deviceUid/files/upload-sms")
                .addHeader("Authorization", "Bearer $authToken")
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw Exception("Empty response from server")

            if (!response.isSuccessful) {
                Log.e(TAG, "SMS upload failed: ${response.code} / $responseBody")
                throw Exception("Upload failed: ${response.code} – $responseBody")
            }

            // السيرفر يرجع { "fileKey": "backups/dev_xxx/sms_xxx.json" }
            val result = gson.fromJson(responseBody, Map::class.java)
            val fileKey = result["fileKey"] as? String
                ?: throw Exception("Server did not return fileKey")

            Log.i(TAG, "SMS backup uploaded successfully: $fileKey")
            fileKey
        }
    }
}
