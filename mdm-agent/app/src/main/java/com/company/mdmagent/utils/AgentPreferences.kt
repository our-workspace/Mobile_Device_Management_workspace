package com.company.mdmagent.utils

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted local storage for sensitive agent data (deviceUid, authToken)
 */
object AgentPreferences {

    private const val FILE_NAME = "agent_secure_prefs"
    private const val KEY_DEVICE_UID = "device_uid"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_WS_URL = "ws_url"
    private const val KEY_HEARTBEAT_INTERVAL = "heartbeat_interval"
    private const val KEY_AGENT_START_TIME = "agent_start_time"

    private fun getPrefs(context: Context): android.content.SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun isRegistered(context: Context): Boolean {
        val prefs = getPrefs(context)
        return prefs.getString(KEY_DEVICE_UID, null) != null &&
               prefs.getString(KEY_AUTH_TOKEN, null) != null
    }

    fun saveRegistration(context: Context, deviceUid: String, authToken: String, wsUrl: String, heartbeatInterval: Int) {
        getPrefs(context).edit().apply {
            putString(KEY_DEVICE_UID, deviceUid)
            putString(KEY_AUTH_TOKEN, authToken)
            putString(KEY_WS_URL, wsUrl)
            putInt(KEY_HEARTBEAT_INTERVAL, heartbeatInterval)
            apply()
        }
    }

    fun getDeviceUid(context: Context): String? = getPrefs(context).getString(KEY_DEVICE_UID, null)
    fun getAuthToken(context: Context): String? = getPrefs(context).getString(KEY_AUTH_TOKEN, null)
    fun getWsUrl(context: Context): String? = getPrefs(context).getString(KEY_WS_URL, null)
    fun getHeartbeatInterval(context: Context): Int = getPrefs(context).getInt(KEY_HEARTBEAT_INTERVAL, 30)

    fun saveAgentStartTime(context: Context, time: Long) {
        getPrefs(context).edit().putLong(KEY_AGENT_START_TIME, time).apply()
    }

    fun getAgentStartTime(context: Context): Long = getPrefs(context).getLong(KEY_AGENT_START_TIME, System.currentTimeMillis())

    fun clearAll(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}
