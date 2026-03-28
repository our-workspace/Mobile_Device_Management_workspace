<div dir="rtl">

# Advanced ADB Shell Reference for MDM Developers

هذا المستند يعتبر مرجعاً متقدماً لأوامر `adb shell` مخصصاً لمطوري ومسؤولي أنظمة MDM. الأوامر مصاغة لتكون قابلة للاستخدام مع أي تطبيق بمجرد استبدال المتغيرات (مثل `<PACKAGE_NAME>` و `<SERVICE_NAME>`).

---

## 1. Activity Manager (`am`) - إدارة الأنشطة والخدمات والبث

يُستخدم للتحكم العميق بمسار حياة التطبيقات (Life-cycle)، البث (Broadcasts)، والخدمات.

### بدء خدمة في الخلفية أو كخدمة أمامية
```bash
# Start a background service
adb shell am startservice -n <PACKAGE_NAME>/<SERVICE_NAME>

# Start a foreground service (Android 8.0+)
adb shell am start-foreground-service -n <PACKAGE_NAME>/<SERVICE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** لاختبار بدء خدمة صامتة (استهداف الـ Backend) أو خدمة أمامية (Foreground) يدوياً. ابحث في الـ Logcat عن بدء الخدمة بنجاح دون أخطاء `IllegalStateException`.

### إرسال بث (Broadcast) مخصص
```bash
adb shell am broadcast -a <ACTION_NAME> -n <PACKAGE_NAME>/<RECEIVER_NAME> --es <STRING_KEY> "<STRING_VALUE>"
```
* **متى يُستخدم وفي ماذا تبحث:** لمحاكاة وصول أحداث النظام (مثل `android.intent.action.BOOT_COMPLETED`) أو إرسال بيانات وهمية. تحقق من استجابة الـ Receiver في تطبيقك لتلك الأحداث.

### إيقاف تطبيق بالكامل (Force Stop)
```bash
adb shell am force-stop <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** عند الحاجة لـ "قتل" التطبيق وكل عملياته إجبارياً للحكم على ما إذا كانت الخدمة ستُعيد تشغيل نفسها (Sticky). راقب الـ Logcat لترى إن كان التطبيق ينهض من جديد.

### مسح بيانات التطبيق بالكامل (Clear Data)
```bash
adb shell pm clear <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** لإعادة التطبيق كأنه حُمل للتو (يمحسح SharedPreferences وقواعد البيانات). مفيد جداً لاختبار عملية التسجيل (Enrollment) من الصفر.

### مراقبة انهيار التطبيقات (Crash / ANR)
```bash
adb shell am monitor
```
* **متى يُستخدم وفي ماذا تبحث:** قنص وتتبع لحظي لأعطال التطبيقات أو شاشات التجمد (ANR) التي تحدث في الخلفية. سيعرض تفاصيل الانهيار مباشرة في الـ Terminal.

---

## 2. Dumpsys (`dumpsys`) - فحص وتشخيص حالة النظام

يُستخدم لاستخراج بيانات خام وحيوية مقروءة عن كافة أجزاء نظام الأندرويد.

### فحص حالة تطبيق معين (Activities/Services/Broadcasts)
```bash
adb shell dumpsys activity <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** لمعرفة ما إذا كانت خدمتك قيد التشغيل في الخلفية حالياً (`ServiceRecord`)، وما هي الأنشطة المكدسة (`ActivityRecord`)، وحالة أي بث متعلق بالتطبيق.

### فحص الحزم والتراخيص (Package Manager)
```bash
adb shell dumpsys package <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** للتحقق من الصلاحيات الممنوحة للتطبيق فعلياً (`granted=true`)، المخفية منها أو التابعة للنظام، وحالة مسارات التثبيت وإصدار التطبيق.

### فحص استهلاك البطارية والقيود (BatteryStats & DeviceIdle)
```bash
# Check battery stats for specific package
adb shell dumpsys batterystats --charged <PACKAGE_NAME>

# Force device into idle (Doze mode)
adb shell dumpsys deviceidle step
```
* **متى يُستخدم وفي ماذا تبحث:** لمعرفة ما إذا كان النظام يقتل خدمتك بسبب استهلاك البطارية أو الـ Wakelocks. الأمر الثاني يجبر الجهاز على الدخول في وضع السكون (Doze) لاختبار صمود خدمتك (يجب أن تكون في الـ Whitelist).

### فحص المهام المجدولة (JobScheduler)
```bash
adb shell dumpsys jobscheduler | grep <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** التأكد من أن مهام الـ WorkManager أو Jobs تمت جدولتها بنجاح (`Pending Jobs`)، ومعرفة سبب عدم تنفيذه (مثلاً: بانتظار شبكة Wi-Fi أو شاحن).

### تحليل الذاكرة (Memory Info)
```bash
adb shell dumpsys meminfo <PACKAGE_NAME> -d
```
* **متى يُستخدم وفي ماذا تبحث:** التحقق من وجود تسريب للذاكرة (Memory Leak) في التطبيق، والاطلاع على مقدار استهلاك كائنات Java (Heap) والموارد الخام.

### التشخيص المتقدم للشبكة (Network & Connectivity)
```bash
# Network statistics
adb shell dumpsys netstats detail

# Connectivity info
adb shell dumpsys connectivity
```
* **متى يُستخدم وفي ماذا تبحث:** لتحليل ما إذا كان هناك اتصال مقطوع أو مراقبة استهلاك الـ Data حسب كل حزمة، والتأكد من توافر الشبكة قبل بدء مهام المزامنة.

---

## 3. Command Line Interface (`cmd`) - خدمات النظام الداخلية

تمت إضافتها في إصدارات أندرويد الحديثة كواجهة للوصول السريع لخدمات الـ Manager.

### إدارة صلاحيات التطبيق الخفية (AppOps)
```bash
adb shell cmd appops set <PACKAGE_NAME> <OP_NAME> <allow | deny | ignore | default>
```
* **متى يُستخدم وفي ماذا تبحث:** لفرض أو سحب صلاحيات خاصة لا يمكن إدارتها بسهولة (مثل الوصول للكاميرا بالخلفية، أو تجاوز الـ Battery Optimization). يسمح بمحاكاة سلوك المستخدم الفعلي.

### تزييف حالة الشبكة أو البطارية
```bash
# Unplug battery
adb shell cmd battery unplug

# Set battery level to X (1-100)
adb shell cmd battery set level <LEVEL>

# Reset battery state
adb shell cmd battery reset
```
* **متى يُستخدم وفي ماذا تبحث:** خداع الجهاز بأنه مفصول عن الشاحن والبطارية ضعيفة، لاختبار كيف يتصرف تطبيق الـ MDM وهل يرسل تحذيراً للخادم.

### تنفيذ المهام المجدولة إجبارياً
```bash
adb shell cmd jobscheduler run -f <PACKAGE_NAME> <JOB_ID>
```
* **متى يُستخدم وفي ماذا تبحث:** لإجبار مهمة (Job/Work) على التنفيذ فوراً دون انتظار مطابقة شروطها. مفيد جداً لتسريع اختبارات وظائف المزامنة (Sync) صعوداً إلى الخادم.

### إخفاء أو محاكاة تعطيل تطبيق (Suspend / Disable)
```bash
# Suspend package
adb shell cmd package suspend <PACKAGE_NAME>

# Unsuspend package
adb shell cmd package unsuspend <PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** لاختبار ممارسات الحظر أو Kiosk Mode، ومحاكاة ما يحدث إذا قام مدير النظام بتعطيل حزم معينة عن بُعد.

---

## 4. أوامر وخدمات أخرى مهمة لمطوّر MDM

### تعيين التطبيق كـ Device Owner (مالك الجهاز)
```bash
adb shell dpm set-device-owner <PACKAGE_NAME>/<ADMIN_RECEIVER_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** هذا هو الأمر الأهم لتفعيل صلاحيات الـ MDM القصوى (Kiosk، حذف عن بعد، قفل صامت). تبحث عن رسالة `Success: Device owner set`. *(ملاحظة: يعمل فقط إذا لم يكن هناك حسابات مُسجلة في الجهاز)*.

### إزالة حالة Device Owner
```bash
adb shell dpm remove-active-admin <PACKAGE_NAME>/<ADMIN_RECEIVER_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** لإزالة صلاحيات الـ MDM من التطبيق حتى تتمكن من إزالته بالكامل بدون الاحتياج لإعادة ضبط المصنع في بيئة التطوير.

### تجاهل تحسين استهلاك البطارية (Doze Whitelist)
```bash
adb shell dumpsys deviceidle whitelist +<PACKAGE_NAME>
```
* **متى يُستخدم وفي ماذا تبحث:** إضافة تطبيقك إجبارياً إلى القائمة البيضاء (Whitelist) ليظل يعمل في الخلفية بقوة ولا يقتله النظام.

### محاكاة تفاعل الإدخال (اللمس والنصوص)
```bash
# Input text
adb shell input text "<STRING>"

# Tap coordinates
adb shell input tap <X> <Y>

# Send keyevent
adb shell input keyevent <KEYCODE>
```
* **متى يُستخدم وفي ماذا تبحث:** أتمتة وتجاوز شاشات الترحيب، النقر على الأزرار بشكل آلي لتسريع الاختبارات.

### منح أو سحب التراخيص (Permissions)
```bash
# Grant permission
adb shell pm grant <PACKAGE_NAME> <PERMISSION_STRING>

# Revoke permission
adb shell pm revoke <PACKAGE_NAME> <PERMISSION_STRING>
```
* **متى يُستخدم وفي ماذا تبحث:** لتسريع دورة التطوير عبر إعطاء الصلاحيات مباشرة دون المرور بـ UI موافقة المستخدم.

### جلب خصائص الجهاز والنظام
```bash
adb shell getprop | grep <PROPERTY_NAME_OR_KEYWORD>
```
* **متى يُستخدم وفي ماذا تبحث:** لجلب معلومات الجهاز الفنية (مثل `ro.build.version.sdk`، `ro.product.model`) لاختبار دقة ما يجمعه ويصّدره التطبيق للـ Backend.


--

--

# adb-advanced-cheatsheet.md

سأقسّم المستند لأقسام، وفي كل قسم أوامر عامة مع متغيرات مثل `PACKAGE_NAME` و`SERVICE_NAME` و`ACTIVITY_NAME` إلخ، عشان تغيّرها حسب اللي تبيه. [testmuai](https://www.testmuai.com/blog/adb-commands/)

***

## 1. إدارة الأنشطة (Activities) عبر `am`

### تشغيل Activity معيّنة

```bash
adb shell am start -n PACKAGE_NAME/ACTIVITY_NAME
# مثال:
# adb shell am start -n com.example.app/.MainActivity
```

```bash
adb shell am start -a ACTION_NAME -d "URI" -n PACKAGE_NAME/ACTIVITY_NAME
# لفتح Intent مخصص مع Action و Data (deeplink مثلاً)
```

```bash
adb shell am start -W -n PACKAGE_NAME/ACTIVITY_NAME
# يشغّل الـ Activity وينتظر حتى الاكتمال ويعطيك timing، مفيد لقياس زمن الإقلاع.
```

### إرسال Broadcasts

```bash
adb shell am broadcast -a ACTION_NAME
# Broadcast عام بالنظام
```

```bash
adb shell am broadcast -a ACTION_NAME -n PACKAGE_NAME/RECEIVER_NAME
# Broadcast موجه لـ BroadcastReceiver معيّن في تطبيقك.
```

### تشغيل Services (بما فيها Foreground)

```bash
adb shell am start-service -n PACKAGE_NAME/SERVICE_NAME
# بدء Service عادي في الخلفية.
```

```bash
adb shell am start-foreground-service -n PACKAGE_NAME/SERVICE_NAME
# بدء ForegroundService (مهم لتطبيقات MDM والـ agents).
```

### التحكم بحالة التطبيق

```bash
adb shell am force-stop PACKAGE_NAME
# يقتل كل عمليات التطبيق كأنه "إيقاف إجباري" من الإعدادات.
```

```bash
adb shell am kill PACKAGE_NAME
# يقتل process للتطبيق بدون لمس بياناته أو cache.
```

***

## 2. أوامر `dumpsys` المتقدمة (تحليل عميق)

> مبدأ عام:  
> `adb shell dumpsys SERVICE_NAME`  
> أو  
> `adb shell dumpsys SERVICE_NAME PACKAGE_NAME` إن كان مدعوم. [developer.android](https://developer.android.com/tools/dumpsys)

### نشاط التطبيق والحالة الحالية

```bash
adb shell dumpsys activity activities
# معلومات مفصلة عن كل الـ Activities والـ tasks الحالية (مفيد لمعرفة ما هو المفتوح الآن). [web:71][web:75]
```

```bash
adb shell dumpsys activity PACKAGE_NAME
# ملخّص حالة الـ activities / services / receivers لتطبيق معيّن (إن كان مدعوم).
```

```bash
adb shell dumpsys activity services PACKAGE_NAME
# تفاصيل الخدمات (Services) النشطة داخل هذا التطبيق. [web:62]
```

### حالة الخدمات (Services) العامة

```bash
adb shell dumpsys activity services
# كل الخدمات على الجهاز، مع المدد، الـ client، الـ foreground/background إلخ. [web:62]
```

### البثّيات (Broadcasts)

```bash
adb shell dumpsys activity broadcasts
# كل Broadcasts المسجلة في النظام، المفيدة لمعرفة أي مستقبلات (Receivers) لتطبيقك تعمل الآن. [web:62]
```

### الحزم (Packages) والصلاحيات

```bash
adb shell dumpsys package PACKAGE_NAME
# كل شيء تقريباً عن الحزمة: permissions, activities, services, receivers, providers, الخ. [web:71][web:62]
```

```bash
adb shell dumpsys package PACKAGE_NAME | grep -i "permission"
# تصفية صلاحيات التطبيق فقط. [web:62]
```

### حالة الشبكة / الاتصالات

```bash
adb shell dumpsys connectivity
# حالة network connectivity, الشبكات الفعالة, transport types, إلخ. [web:77]
```

```bash
adb shell dumpsys netstats
# counters تفصيلية لاستخدام الشبكة (TX/RX) لكل uid / iface. مفيد لـ agents. [web:77]
```

### البطارية والطاقة (مفيد لمحاكاة ظروف MDM)

```bash
adb shell dumpsys battery
# حالة البطارية الحالية (نسبة, شحن, حرارة, إلخ). [web:61][web:73]
```

```bash
adb shell dumpsys battery set level N
# يغير مستوى البطارية إلى قيمة وهمية (0–100) لاختبار سلوك التطبيق تحت low battery. [web:61][web:73]
```

```bash
adb shell dumpsys battery set status STATUS
# تغيير حالة البطارية (1=Unknown, 2=Charging, 3=Discharging, 4=Not charging, 5=Full). [web:61][web:73]
```

```bash
adb shell dumpsys battery reset
# يرجع كل إعدادات البطارية للحالة الطبيعية. [web:73]
```

### الذاكرة / الـ CPU

```bash
adb shell dumpsys meminfo PACKAGE_NAME
# استهلاك الذاكرة للتطبيق (native, dalvik, graphics, إلخ) بالتفصيل. [web:61][web:76]
```

```bash
adb shell dumpsys cpuinfo
# استهلاك CPU لكل عملية / UID، جيد لمعرفة ثقل الـ agent أو الـ service. [web:61]
```

***

## 3. أوامر `cmd` للخدمات الداخلية

### الحزم والتثبيت (`cmd package`)

```bash
adb shell cmd package list packages
# يعرض جميع الحزم (يشبه pm list packages لكن بأسلوب service). [web:74]
```

```bash
adb shell cmd package list packages PACKAGE_NAME
# بحث عن حزمة محددة/مفلترة.
```

```bash
adb shell cmd package clear PACKAGE_NAME
# مسح بيانات التطبيق (يعادل Clear storage) بدون إلغاء تثبيت. [web:61]
```

```bash
adb shell cmd package set-install-location 0|1|2
# تغيير موقع تثبيت الحزم (0=auto, 1=internal, 2=sdcard) – للاختبارات فقط. [web:61]
```

### الشبكة (`cmd connectivity` وغيره)

```bash
adb shell cmd connectivity airplane-mode enable
adb shell cmd connectivity airplane-mode disable
# تمكين / تعطيل وضع الطائرة برمجياً (قد يحتاج صلاحيات خاصة / root حسب الجهاز). [web:72]
```

```bash
adb shell cmd connectivity tether start
adb shell cmd connectivity tether stop
# بدء / إيقاف tethering من سطر الأوامر (قد لا يعمل على كل النسخ). [web:72]
```

### الـ JobScheduler (مفيد في الـ agents وسيناريوهات sync)

```bash
adb shell cmd jobscheduler run PACKAGE_NAME JOB_ID --force
# تشغيل Job معيّن فوراً حتى لو لم تتحقق شروطه (WiFi, charging, idle...). [web:76]
```

```bash
adb shell cmd jobscheduler get-pending
# عرض الـ jobs المعلّقة لكل الحزم.
```

***

## 4. أوامر عملية لمراقبة عمليات تطبيق معيّن

### معرفة الـ PID للتطبيق

```bash
adb shell pidof -s PACKAGE_NAME
# يرجع PID واحد (simple) يمكن استخدامه مع logcat أو kill. [web:62]
```

### مراقبة الـ logs لتطبيق معيّن فقط

```bash
adb shell pidof -s PACKAGE_NAME
# خذ الناتج وليكن 12345، ثم:
adb logcat --pid=12345
# فلترة logcat على PID هذا فقط. [web:62]
```

أو باستخدام tags عامة تحطّها في كودك:

```bash
adb logcat TAG1:D TAG2:D TAG3:D *:S
# مثال:
# adb logcat AgentService:D ApiClient:D WebSocketManager:D *:S
```

***

## 5. إدارة الإتصالات (Sockets, Ports, Network)

### رؤية الاتصالات المفتوحة من الجهاز

```bash
adb shell netstat
# كل TCP/UDP connections المفتوحة على الجهاز. [web:61]
```

```bash
adb shell netstat | grep PACKAGE_NAME_OR_PORT
# فلترة على بورت أو جزء من اسم الباكيج (لو الجهاز فيه grep).
```

### اختبار إتصال من داخل الجهاز نفسه

```bash
adb shell ping -c 3 HOST_OR_IP
# مثلاً:
# adb shell ping -c 3 nonparadoxical-justin-nonmigratory.ngrok-free.dev
```

```bash
adb shell curl -v "https://HOST/path"
# لو كان curl موجود في النظام (بعض الرومات / busybox).
```

***

## 6. التحكم بالجهاز (Inputs, شاشة, إلخ)

### إدخال أوامر لمس / أزرار (مفيد لأتمتة الاختبارات)

```bash
adb shell input keyevent KEYCODE
# مثال:
# adb shell input keyevent 26    # زر الباور
# adb shell input keyevent 3     # Home
# adb shell input keyevent 187   # Recent apps
```

```bash
adb shell input tap X Y
# ضغطة على الشاشة في إحداثيات معيّنة (بكسل).
```

```bash
adb shell input text "some text here"
# كتابة نص في الحقل الحالي. [web:61]
```

### إدارة الشاشة / الاتجاه

```bash
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0   # Portrait
adb shell settings put system user_rotation 1   # Landscape
# تثبيت اتجاه الشاشة لاختبارات معيّنة. [web:69]
```

***

## 7. قوالب عامّة (Templates) قابلة للنسخ واللصق

هذه مجموعة أوامر بصيغة ready-to-edit، فقط استبدل المتغيّرات:

```bash
# تشغيل Activity رئيسية لتطبيق:
adb shell am start -n PACKAGE_NAME/MAIN_ACTIVITY_NAME

# تشغيل Service / ForegroundService لتطبيق agent:
adb shell am start-foreground-service -n PACKAGE_NAME/SERVICE_NAME

# إيقاف التطبيق إجبارياً:
adb shell am force-stop PACKAGE_NAME

# فحص حالة Services لهذا التطبيق:
adb shell dumpsys activity services PACKAGE_NAME

# فحص كامل لحالة الحزمة (permissions, components, إلخ):
adb shell dumpsys package PACKAGE_NAME

# عرض استهلاك الذاكرة للتطبيق:
adb shell dumpsys meminfo PACKAGE_NAME

# عرض استهلاك الشبكة على المستوى العام:
adb shell dumpsys netstats

# تشغيل JobScheduler معين:
adb shell cmd jobscheduler run PACKAGE_NAME JOB_ID --force

# مراقبة لوغ التطبيق فقط:
APP_PID=$(adb shell pidof -s PACKAGE_NAME)
adb logcat --pid=$APP_PID
```

كل ما تحتاجه لاحقاً هو أن تفتح هذا المستند، وتستبدل:  
- `PACKAGE_NAME` باسم الباكيج لتطبيقك أو أي تطبيق آخر  
- `SERVICE_NAME` و`ACTIVITY_NAME` و`JOB_ID` حسب الحالة  
