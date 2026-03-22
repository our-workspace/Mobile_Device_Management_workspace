package com.company.mdmagent.utils

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import android.os.SystemClock
import android.telephony.TelephonyManager
import com.company.mdmagent.network.BatteryInfo
import com.company.mdmagent.network.NetworkInfo
import com.company.mdmagent.network.StorageInfo
import com.company.mdmagent.network.UptimeInfo
import java.io.File

object DeviceInfoUtils {

    // ---- Android ID ----
    @SuppressLint("HardwareIds")
    fun getAndroidId(context: Context): String {
        return android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown"
    }

    // ---- Device Model Info ----
    fun getModel(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
    fun getManufacturer(): String = Build.MANUFACTURER ?: "unknown"
    fun getAndroidVersion(): String = Build.VERSION.RELEASE ?: "unknown"
    fun getSdkVersion(): Int = Build.VERSION.SDK_INT
    fun getSerial(): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Build.getSerial()
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL.takeIf { it != Build.UNKNOWN }
            }
        } catch (e: SecurityException) {
            null
        }
    }

    // ---- Battery ----
    fun getBatteryInfo(context: Context): BatteryInfo {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val isCharging = bm.isCharging

        val chargingType = if (isCharging) {
            val plugged = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
            when {
                bm.getIntProperty(BatteryManager.BATTERY_HEALTH_GOOD) != 0 -> "AC"
                else -> "USB"
            }
        } else null

        return BatteryInfo(
            level = level.coerceIn(0, 100),
            isCharging = isCharging,
            chargingType = chargingType
        )
    }

    // ---- Network ----
    fun getNetworkInfo(context: Context): NetworkInfo {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val capabilities = network?.let { cm.getNetworkCapabilities(it) }

        if (capabilities == null) {
            return NetworkInfo(type = "NONE", isConnected = false, wifiSignalLevel = null, mobileNetworkType = null)
        }

        val isWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        val isMobile = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val isConnected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

        return when {
            isWifi -> {
                val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
                val rssi = wm.connectionInfo.rssi
                val signalLevel = android.net.wifi.WifiManager.calculateSignalLevel(rssi, 5)
                NetworkInfo(type = "WIFI", isConnected = isConnected, wifiSignalLevel = signalLevel, mobileNetworkType = null)
            }
            isMobile -> {
                val netType = getMobileNetworkType(context)
                NetworkInfo(type = "MOBILE", isConnected = isConnected, wifiSignalLevel = null, mobileNetworkType = netType)
            }
            else -> NetworkInfo(type = "NONE", isConnected = false, wifiSignalLevel = null, mobileNetworkType = null)
        }
    }

    @SuppressLint("MissingPermission")
    private fun getMobileNetworkType(context: Context): String {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        return try {
            when (tm.networkType) {
                TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
                TelephonyManager.NETWORK_TYPE_NR -> "5G"
                TelephonyManager.NETWORK_TYPE_HSPAP,
                TelephonyManager.NETWORK_TYPE_HSPA,
                TelephonyManager.NETWORK_TYPE_HSDPA -> "3G"
                TelephonyManager.NETWORK_TYPE_EDGE,
                TelephonyManager.NETWORK_TYPE_GPRS -> "2G"
                else -> "UNKNOWN"
            }
        } catch (e: Exception) {
            "UNKNOWN"
        }
    }

    // ---- Storage ----
    fun getStorageInfo(): StorageInfo {
        val stat = StatFs(android.os.Environment.getDataDirectory().path)
        val total = stat.blockCountLong * stat.blockSizeLong
        val free = stat.availableBlocksLong * stat.blockSizeLong
        val used = if (total > 0) ((total - free) * 100 / total).toInt() else 0
        return StorageInfo(totalBytes = total, freeBytes = free, usedPercent = used)
    }

    // ---- Uptime ----
    fun getUptimeInfo(agentStartTime: Long): UptimeInfo {
        val deviceUptime = SystemClock.elapsedRealtime()
        val agentUptime = System.currentTimeMillis() - agentStartTime
        return UptimeInfo(deviceUptimeMs = deviceUptime, agentUptimeMs = agentUptime)
    }

    // ---- Device Info Map (للـ get_device_info command) ----
    fun getFullDeviceInfo(context: Context): Map<String, Any?> {
        val battery = getBatteryInfo(context)
        val network = getNetworkInfo(context)
        val storage = getStorageInfo()

        return mapOf(
            "androidId" to getAndroidId(context),
            "serial" to getSerial(),
            "model" to Build.MODEL,
            "manufacturer" to Build.MANUFACTURER,
            "brand" to Build.BRAND,
            "product" to Build.PRODUCT,
            "device" to Build.DEVICE,
            "androidVersion" to Build.VERSION.RELEASE,
            "sdkVersion" to Build.VERSION.SDK_INT,
            "buildId" to Build.DISPLAY,
            "hardware" to Build.HARDWARE,
            "battery" to mapOf(
                "level" to battery.level,
                "isCharging" to battery.isCharging,
                "chargingType" to battery.chargingType
            ),
            "network" to mapOf(
                "type" to network.type,
                "isConnected" to network.isConnected
            ),
            "storage" to mapOf(
                "totalBytes" to storage.totalBytes,
                "freeBytes" to storage.freeBytes,
                "usedPercent" to storage.usedPercent
            ),
            "deviceUptimeMs" to SystemClock.elapsedRealtime()
        )
    }
}
