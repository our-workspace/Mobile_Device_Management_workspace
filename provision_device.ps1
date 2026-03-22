# provision_device.ps1
# =====================================================================
# MDM Agent Provisioning Script
# Auto-detects connected devices and prompts for selection if multiple
# =====================================================================

$APK_PATH = ".\mdm-agent\app\build\outputs\apk\debug\app-debug.apk"
$PACKAGE_NAME = "com.company.mdmagent"

# ---- Function to provision a single device ----
function Invoke-ProvisionDevice {
    param(
        [string]$Serial,
        [string]$DeviceName
    )

    # Helper function to execute ADB commands on specific device
    function adb_device { adb -s $Serial @args }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor DarkGray
    Write-Host "  Provisioning: $DeviceName ($Serial)" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor DarkGray

    # 1. Install APK
    Write-Host "[1/7] Installing Agent APK..." -ForegroundColor Yellow
    $installResult = adb_device install -r $APK_PATH 2>&1
    if ($installResult -match "Success") {
        Write-Host "      APK installed successfully" -ForegroundColor Green
    }
    else {
        Write-Host "      Installation failed: $installResult" -ForegroundColor Red
        return $false
    }

    # 2. SMS Permissions
    Write-Host "[2/7] Granting SMS permissions..." -ForegroundColor Yellow
    adb_device shell pm grant $PACKAGE_NAME android.permission.READ_SMS     | Out-Null
    adb_device shell pm grant $PACKAGE_NAME android.permission.RECEIVE_SMS  | Out-Null
    Write-Host "      Done" -ForegroundColor Green

    # 3. Network & Device Permissions
    Write-Host "[3/7] Granting network/device permissions..." -ForegroundColor Yellow
    adb_device shell pm grant $PACKAGE_NAME android.permission.READ_PHONE_STATE      | Out-Null
    adb_device shell pm grant $PACKAGE_NAME android.permission.ACCESS_NETWORK_STATE  | Out-Null
    adb_device shell pm grant $PACKAGE_NAME android.permission.ACCESS_WIFI_STATE     | Out-Null
    Write-Host "      Done" -ForegroundColor Green

    # 4. Storage Permissions
    Write-Host "[4/7] Granting storage permissions..." -ForegroundColor Yellow
    adb_device shell pm grant $PACKAGE_NAME android.permission.READ_EXTERNAL_STORAGE | Out-Null
    Write-Host "      Done" -ForegroundColor Green

    # 5. Doze Whitelist (Battery Optimization)
    Write-Host "[5/7] Adding to Doze whitelist..." -ForegroundColor Yellow
    $dozeResult = adb_device shell dumpsys deviceidle whitelist "+$PACKAGE_NAME" 2>&1
    Write-Host "      Doze whitelist command executed" -ForegroundColor Green

    # 6. NotificationListenerService
    Write-Host "[6/7] Enabling NotificationListener..." -ForegroundColor Yellow

    # محاولة تفعيل الـ listener على هذا الجهاز
    $nlsResult = adb_device shell cmd notification allow_listener "$PACKAGE_NAME/.collectors.NotificationListener" 2>&1

    if ($nlsResult -match "error|fail") {
        Write-Host "      Failed to enable via cmd notification allow_listener: $nlsResult" -ForegroundColor Red
        Write-Host "      May need manual approval in: Settings -> Apps -> Special Access -> Notification Access" -ForegroundColor DarkYellow
    }
    else {
        Write-Host "      Allow listener command executed." -ForegroundColor Green
    }

    # التحقق من أن الـ listener مضاف فعلياً في enabled_notification_listeners
    Write-Host "      Verifying enabled_notification_listeners..." -ForegroundColor Yellow
    $listeners = adb_device shell settings get secure enabled_notification_listeners 2>&1
    Write-Host "      enabled_notification_listeners:" -ForegroundColor DarkGray
    Write-Host "        $listeners" -ForegroundColor DarkGray

    if ($listeners -like "*$PACKAGE_NAME/.collectors.NotificationListener*") {
        Write-Host "      ✅ NotificationListener is enabled for $PACKAGE_NAME" -ForegroundColor Green
    }
    else {
        Write-Host "      ⚠️  Listener NOT found in enabled_notification_listeners, manual enable may be required." -ForegroundColor DarkYellow
    }


    # 7. Start Service
    Write-Host "[7/7] Starting Agent service..." -ForegroundColor Yellow
    adb_device shell am start-foreground-service `
        -n "$PACKAGE_NAME/.core.AgentService" `
        --es "action" "START" | Out-Null
    Write-Host "      Service started" -ForegroundColor Green

    Write-Host ""
    Write-Host "  $DeviceName provisioned successfully!" -ForegroundColor Green
    Write-Host "  The device should appear in the dashboard within ~30 seconds." -ForegroundColor DarkGray
    return $true
}

# =====================================================================
# MAIN
# =====================================================================

# Check if APK exists
if (-not (Test-Path $APK_PATH)) {
    Write-Host "APK not found at: $APK_PATH" -ForegroundColor Red
    Write-Host "Place app-debug.apk next to this script and try again." -ForegroundColor DarkGray
    exit 1
}

# Detect connected devices
Write-Host ""
Write-Host "Detecting connected ADB devices..." -ForegroundColor Cyan

# Run adb devices and skip the header line "List of devices attached"
$adbOutput = adb devices 2>&1 | Select-Object -Skip 1

# Build device list (serial + model)
$deviceList = @()

foreach ($line in $adbOutput) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
    }

    # Split on whitespace: first column = serial (USB serial or IP:port), second = state
    $parts = $trimmed -split "\s+"
    if ($parts.Count -ge 2 -and $parts[1] -eq "device") {
        $serial = $parts[0]

        # Get device model
        $model = adb -s $serial shell getprop ro.product.model 2>&1
        $model = $model.Trim()
        if (-not $model) { $model = "Unknown" }

        $deviceList += [PSCustomObject]@{
            Serial = $serial
            Model  = $model
        }
    }
}

# No devices found
if ($deviceList.Count -eq 0) {
    Write-Host "No ADB devices connected." -ForegroundColor Red
    Write-Host "Make sure USB Debugging is enabled and the device is connected." -ForegroundColor DarkGray
    exit 1
}

# Single device -> direct confirmation
if ($deviceList.Count -eq 1) {
    $dev = $deviceList[0]
    Write-Host "Found 1 device: $($dev.Model) [$($dev.Serial)]" -ForegroundColor Green
    $confirm = Read-Host "Provision this device? (y/n)"
    if ($confirm -notin @('y', 'Y', 'yes', 'Yes')) {
        Write-Host "Aborted." -ForegroundColor DarkGray
        exit 0
    }
    Invoke-ProvisionDevice -Serial $dev.Serial -DeviceName $dev.Model
    exit 0
}

# Multiple devices -> selection menu
Write-Host ""
Write-Host "Found $($deviceList.Count) connected devices:" -ForegroundColor Green
Write-Host ""

for ($i = 0; $i -lt $deviceList.Count; $i++) {
    $dev = $deviceList[$i]
    Write-Host ("  [{0}] {1,-30} Serial: {2}" -f ($i + 1), $dev.Model, $dev.Serial) -ForegroundColor White
}

Write-Host ("  [{0}] All devices" -f ($deviceList.Count + 1)) -ForegroundColor Magenta
Write-Host "  [0] Cancel" -ForegroundColor DarkGray
Write-Host ""

$choice = Read-Host "Select an option"

# Cancel
if ($choice -eq "0") {
    Write-Host "Aborted." -ForegroundColor DarkGray
    exit 0
}

# All devices
if ($choice -eq ($deviceList.Count + 1).ToString()) {
    Write-Host ""
    Write-Host "Provisioning ALL $($deviceList.Count) devices..." -ForegroundColor Magenta
    $success = 0
    $failed = 0
    foreach ($dev in $deviceList) {
        $result = Invoke-ProvisionDevice -Serial $dev.Serial -DeviceName $dev.Model
        if ($result) { $success++ } else { $failed++ }
    }
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor DarkGray
    Write-Host "  Summary: $success succeeded, $failed failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Yellow' })
    Write-Host "==================================================" -ForegroundColor DarkGray
    exit 0
}

# Specific device
$idx = 0
if (-not [int]::TryParse($choice, [ref]$idx)) {
    Write-Host "Invalid input. Please enter a number." -ForegroundColor Red
    exit 1
}
$idx = $idx - 1
if ($idx -lt 0 -or $idx -ge $deviceList.Count) {
    Write-Host "Invalid choice." -ForegroundColor Red
    exit 1
}

$selected = $deviceList[$idx]
Invoke-ProvisionDevice -Serial $selected.Serial -DeviceName $selected.Model
