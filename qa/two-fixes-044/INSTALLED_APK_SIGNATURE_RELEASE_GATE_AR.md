# MainTrack 0.4.4: شرط توقيع APK قبل الترقية الآمنة

التاريخ: 18 أكتوبر 2026. **لا نشر أو حذف.**

## ما ثبت بالأدلة

- فرع الإصلاح: `fix/maintrack-044-session-and-bottom-bar-only-20261018`، وفي كود التطبيق الفعلي تغيّرت فقط `web/maintrack/public/v6-core.js` و`web/maintrack/public/v6-core.css` لحذف الـBottom Navigation Dock. لا تغيير للقائمة الجانبية أو الألوان أو API أو Database.
- [GitHub Actions 39164088303](https://github.com/m-as23/ICC-Reports/actions/runs/39164088303): اختبارات المصدر وChromium عبر Owner/Engineer/Technician ناجحة، كما نجح تثبيت واختبار Android 35 QA APK مستقل `com.icc.maintrack.twopointsqa` يتضمن مكوّن `MainTrackSecureSessionPlugin`. اختبارات: save → force-stop → offline relaunch/restore → logout → post-logout. **هذه النتيجة تخص QA وليس هاتف المستخدم.**
- APK محفوظ من [Stage11 Debug run 38738843363](https://github.com/m-as23/ICC-Reports/actions/runs/38738843363), artifact `MainTrack-Stage11-Debug-APK`، تم استخراج شهادة V2 من ملف APK نفسه عبر APK Signing Block.
  - SHA-256 certificate: `396f7d37149bb56a982844701150ed5cff502ba0fc7f044c847e1cf0446a84a3`
  - Subject: `C=US,O=Android,CN=Android Debug`
  - Artifact SHA كامل قابل للتحقق من Run artifacts.
- الـAndroid 35 QA apk الموجود في artifact `MainTrack-Two-Issues-Native-Session-QA-Proof` له SHA-256 certificate: `f4e531ff64916dc978fab8fff9602412bd5c75c403a328f24e1f8ca1c29fb6db`.
- **الشهادتان مختلفتان قطعًا**، وبالتالي QA artifact ليس تحديثًا in-place للإصدار التاريخي. وفي الأصل يحمل package suffix مختلفًا لتفادي استبدال تطبيق المستخدم.
- **بصمة شهادة APK المثبّت على جهاز المستخدم غير معروفة حتى الآن**. لا يجوز مساواة APK Stage11 التاريخي بملف الهاتف بلا فحص جهاز.
- Workflow Stage11 Debug يستخدم `assembleDebug` على GitHub-hosted runner، ولا يصدّر `debug.keystore` في artifacts. لذلك لا توجد شهادة توقيع قابلة لإعادة الاستخدام من *ذلك artifact وحده*. ملف APK وتوقيعه العمومي لا يمكن استخلاص private signing key منه.
- سكريبت `scripts/harden-native.mjs` يضبط `android:allowBackup="false"`. لا تُعتمد آلية Android Auto Backup كخطة لبيانات المستخدم في حال تغيير شهادة التوقيع.
- اختبار الجلسة يجمع معرفة token داخل Android Keystore على APK **الجديد**؛ لكنه لا يستطيع حقن Plugin Java في APK المثبّت عن طريق OTA HTML/JS.
- شهادة Ed25519 الخاصة بتوقيع **OTA** مختلفة تمامًا عن شهادة Android APK signing، ولا يجوز الخلط بينهما أو افتراض أن الأولى تسمح بالتوقيع الأصلي.
  
## خطوة التحقق المطلوبة قبل أي APK

استخراج **بصمة شهادة APK المثبّت على الجهاز** باستخدام ADB و`apksigner verify --print-certs`. الفحص للـAPK فقط، لا يفتح بيانات حساب المستخدم أو بلاغاته؛ يتم نسخ `base.apk` مؤقتًا وحذفه بعدها. كذلك نسجل `versionCode` و`versionName` من `dumpsys package com.icc.maintrack`.

### قرار الترقية

1. إذا كان لدى المالك مفتاح توقيع صالح يحمل **نفس بصمة شهادة الجهاز** ويمكن توقيع build جديد به، نرفع `versionCode` ونضمن `applicationId=com.icc.maintrack`، ثم نتأكد من install-over-existing على جهاز اختبار يشبه المصدر قبل الموبايل الحقيقي؛ لا يتم حذف التطبيق القديم.
2. إذا لم يوجد مفتاح مطابق، **لا يوجد مسار Android عادي لترقية نفس package في المكان**، ولا نلتف على فحص التوقيع. نحتاج قرارًا جديدًا لإصدار مستقل أو خطة نقل بيانات صريحة وآمنة، مع الإبقاء على القديم وتشغيل/تفريغ البلاغات غير المرسلة والتحقق منها قبل أي تبديل.
3. عدم معرفة الشهادة أو توافر المفتاح = BLOCKED، ولا ننشر APK للتثبيت، ولا نقترح إلغاء تثبيت أو Clear Data.
4. نُبقي MainTrack 0.4.4 الحالي ونظام OTA والقواعد والواجهات كما هي. لا تعديل جديد خارج حذف Bottom Dock وجلسة Android.

## مخاطر معروفة وحدود الثقة

- رغم نجاح Unit/Browser/Android35 QA، **لا توجد إمكانية لتأكيد بقاء جلسة مالك التطبيق على هاتفه الفعلي دون APK native متوافق**.
- إن كانت النسخة الحالية قد بُنيت باستخدام GitHub ephemeral Debug keystore غير محفوظ، فقد يتعذر التحديث في المكان؛ يجب إثبات ذلك بالهوية أولًا بدل التخمين.
- الـZIP التجريبي 0.4.4 هو حزمة واجهة غير موقعة جديدة؛ **لا تنشرها عبر manifest القديم 0.4.4** لأن تحديثًا يجب أن يكون بإصدار أعلى وبتوقيع OTA صالح ومختبر، مع شروط rollback وتوقيع صحيح.
