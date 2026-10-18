# MainTrack 0.4.4 — المصدر الواحد وخطة الانتقال إلى Production

التاريخ: 18 أكتوبر 2026  
الحالة: **Foundation created / NOT LIVE**. هذه الوثيقة لا تفوض حذف أو ترحيل بيانات.

## قرار معماري ثابت

**المشروع:** MainTrack. ملف كود رئيسي واحد من GitHub هو المصدر الوحيد للتطوير، بدل وجود كود منفصل للويب والـAPK والـAPI لا نعرف مصدره.

- **Baseline مجمدة لا نعدل عليها:** `baseline/maintrack-v0.4.4-owner-verified-20261018`، commit `11a910e42c4c5ed6d34bac2102f567bdaa3db927`.
- **إصدار واجهة 0.4.4 المرجعي:** `865229c4706e946377fba811d2f51dad1a815138`.
- **إعدادات الربط الحقيقية:** `ops/maintrack/runtime-registry-0.4.4.json`. أي تغيير URL أو مشروع أو إصدار تحديث يجب أن يراجع ويُحدث فيه.
- **تطوير جديد:** PR ثم اختبارات مؤتمتة ثم Preview ثم مراجعة ثم إطلاق Production **بنسخة محددة وبإمكانية Rollback**. ممنوع النشر مباشرة من فروع التجارب أو فرع `main` القديم قبل إصلاحه/اعتماده.
- **تصنيف الإصدارات:** `development` → `QA` → `release candidate` → `production`؛ نسخة 0.4.4 موجودة اليوم في QA/LAB فقط رغم نجاح تجربة Owner.

## ما الذي يعمل الآن — بكل دقة؟

### Web (Frontend)
- المصدر: `web/maintrack/public/`.
- الهيكل والوظائف: `index.html`، `secure-assets/index-inline-1.js` وCSS وبقية الأصول.
- آخر Preview اختبره Owner: Vercel project `maintrack-final-security-qa`, deployment `dpl_DA1z9Bt8ZcyCQHtTaUk9fvTTvQDf`.
- مشروع Production **الجديد**: `maintrack-production`, id `prj_9IQgcJzKvkSPXxHmzDvy5DrQ0qet`، **فارغ، بدون deployment ولا domain**. لا تستخدمه كواجهة موظفين قبل النشر الآمن.
- تحتاج ملفات Web إلى ضبط API المصرح به ونظام إصدارات ثابت وآمن قبل تسليمها للموظفين.

### Android
- مشروع المصدر: `android/maintrack-app/`، config `capacitor.config.json`.
- App ID المستخدم: `com.icc.maintrack`.
- التحديث المنشور الحالي للاختبار **OTA 0.4.4** على `android/stage14-ota-native-lab`.
- ملف التحديث `updates/android/maintrack-0.4.4.zip` موقّع بالـEd25519 عبر manifest، وليس APK قابلًا للتثبيت المباشر.
- مصدر 0.4.4 المعدل يحوّل استدعاء API إلى `maintrack-unified-four-qa`. التعديل داخل ZIP هو تغيير وحيد على رابط API في `secure-assets/index-inline-1.js`، وبصمة ZIP مثبتة في registry.
- ينتهي signed manifest في 24 أكتوبر 2026 الساعة 14:34 UTC؛ لا يصح الاعتماد على هذا البيان المحدود المدة كقناة موظفين مستدامة بدون سياسة نشر وتحديث متفق عليها.
- ملف Android installable signed Release بمفتاح الموظفين الثابت وبـversionCode أعلى **غير مثبت وجوده للإصدار 0.4.4**. Build debug أو Stage22 QA package لا يساوي إصدار موظفين.
- تظل ميزة «تحديث متاح» مخفية حتى يصل إصدار أعلى متوافق **موقّع**؛ التحقق لا يوجب تنزيلًا تلقائيًا؛ الحفظ المحلي/البلاغات غير المرسلة تمنع التفعيل غير الآمن.

### Backend
- كود المصدر المتتبع: `supabase/functions/maintrack-stage9-security-api/index.ts`.
- في Supabase Staging يوجد `maintrack-stage9-security-api` v10 بـ26 API action فقط.
- في نفس المشروع `maintrack-unified-four-qa` v15 بـ32 API action، منها الوظائف المطلوبة لـ0.4.4: `accountSummary`, `overtimeMine`, `overtimeRequest`, `overtimeDecision`, `overtimeInbox`, `overtimeSummary`.
- لذا Web frontend *الخام* يشير إلى Stage9، بينما APK LAB الموجود يستخدم QA v15. غير مسموح بالقول إن النسختين Production متطابقتان قبل دمج API مع عقد نهائي واحد.
- خدمات مثل `maintrack-pilot-mail-worker` و`maintrack-stage6-api` و`maintrack-stage22-release-canary` ليست قابلة للحذف بلا Trace للـCron أو CORS أو التكاملات.

### Database
- المشروع الحالي المتصل: `MainTrack-Staging` (`tdnkeskczcsukcujwinu`).
- عُثر على 23 جدولًا، و32 migration في Supabase؛ توجد سجلات حقيقية أو تجريبية غير مصنفة، ولا يجوز التعامل معها كقاعدة فارغة.
- `db/applied/` في GitHub يحتوي على بعض ملفات SQL، و`release/stage22/database-schema-catalog-2026-10-18.json` يحتوي وصفًا للجداول. **ليسا Full SQL schema dump ولا Backup للبيانات الفعلية**.
- قاعدة Production المعزولة: **لم تُنشأ بعد**. تأسيسها يتطلب تحديد المنظمة ومراجعة التكلفة، ثم استخلاص schema كاملة + صلاحيات وقواعد بيانات وفهارس وViews وTriggers وإجراءات، واختبار الاستعادة.
- البيانات الإنتاجية الجديدة يجب ألّا تختلط بالبلاغات التجريبية؛ لا نحذف سجلات staging ولا نُغير أرقامها أو ملكياتها أثناء التجهيز.

## الخريطة الثابتة لأي تعديل

| الوظيفة | مكانها في المصدر | الخادم | التحقق |
|---|---|---|---|
| واجهة Dashboard/بلاغ جديد | `web/maintrack/public/` | Vercel | Playwright/browser smoke + mobile layout |
| تسجيل/تعديل البلاغات وأوامر الشغل | Web JS + `supabase/functions/maintrack-stage9-security-api/index.ts` | Supabase Edge + Postgres | Owner/Engineer/Technician RBAC; idempotent write; audit |
| إجازات واعتمادات وعمل إضافي | UI JS + Supabase Edge + جداول `mt_leave_*`, `mt_overtime_*` | Supabase | pending → decision → history + alerts |
| جرس إشعارات وإيميل | UI JS + Edge API + `maintrack-pilot-mail-worker` | Supabase/Resend | deliver/mark-read cross-device after commit |
| التحديث داخل APK | `android/maintrack-app/update-system/` | GitHub signed manifest / native updater | signature, version, local queue, activation, rollback |
| تثبيت APK لأول مرة | Android native build + CI + owner signing keystore | GitHub Actions | appId, cert fingerprint, versionCode, physical install |
| بيانات أو جداول جديدة | ملف Migration موثق + schema registry | Supabase isolated prod | migration idempotence + restore test + RLS review |

## خطوات التطبيق قبل أول موظف

1. **Freeze owner baseline:** خزّنا commit مرجعيًا وبصمات OTA؛ لا نعدّل baseline مباشرة.
2. **Build production infrastructure:** نحدد Production Supabase مشروعًا مستقلًا ونعمل schema restore كاملة؛ نختبر صلاحيات DB والـEdge والتكاملات. لا ننقل test users تلقائيًا.
3. **Unify API:** ننشئ نسخة واحدة مستقرة تضم كل 32 action دون كسر 26 action القديمة، مع CORS لدومين Web رسمي و`https://localhost` للـAndroid. الاحتفاظ بنسخة rollback API.
4. **Deploy Web:** استخدام `maintrack-production` الجديد، build محفوظ SHA، ربط domain ثابت، إشعارات/QR, إصدار update metadata مستدام وغير stale، Stage preview ثم promote بعد الاختبارات.
5. **Release Android:** إنشاء signed installable APK بنفس `com.icc.maintrack` بشهادة Release موثوقة وقاعدة versionCode ونسخة OTA متوافقة معها، وتوثيق Source SHA والتوقيع. لا نتعامل مع OTA ZIP على أنه APK.
6. **Acceptance:** إنشاء بلاغ واحد وتعديله من حساب Tech/Engineer، approve/reject Leave/Overtime من Owner، مشاهدة الإشعارات على Web+Android، منع الوصول إلى سجلات أخرى، إضافة بيانات كتالوج، وفحص Offline queue/rollback. تُنفذ على Production isolated smoke fixture يتم حذفه بتوثيق آمن بعد التحقق.
7. **Go-live gate:** Owner يوافق على الإصدار، ويتم التحقق من backups/restores وسلامة الأسرار وRLS والـmail+QR وCSP، ثم فتح الحسابات الحقيقية.
8. **Cleanup:** بعد فترة مراقبة استعمال ومعرفة اعتماديات URLs والأجهزة، نلغي aliases القديمة ونحذف الفروع/المشاريع غير المستخدمة تدريجيًا، دون فقد القدرة على rollback.

## سياسة الحذف

**ممنوع الحذف حاليًا**: قاعدة Supabase Staging، `updates/android` وفرع OTA LAB، الأسرار ومفاتيح التوقيع، الـWeb QA المستخدم، وظائف mail، المصدر المجمد، سجلات audit أو بيانات الموظفين.

**مرشح للأرشفة بعد توثيق dependencies**: Vercel projects المصممة للمراجعة الأمنية أو إصلاح التنقل؛ الفروع القديمة من Android stage11-13؛ previews القديمة؛ نسخ Debug QA على GitHub Actions بعد حفظ أدلة الاستقرار.

**المساحات ليست متكافئة:** حذف Git branches لا يقلل غالبًا حجم Git history الفعلي بسرعة؛ GitHub Actions artifacts غالبًا لها انتهاء صلاحية؛ حذف Vercel project قد يكسر دومين/QR/روابط رسائل؛ حذف Supabase Function قد يكسر API/cron. نحدّد usage وتقارير Logs قبل أي إجراء.

## Release checklist المطلوب حفظه لكل Update

- الإصدار، source commit كامل، API commit/function version, migration IDs.
- Web deployment ID/domain + static assets SHA-256 + release metadata.
- Android native appId/versionCode/cert SHA256 + OTA signed manifest/ZIP SHA256 + expiry.
- صلاحيات 3 أدوار ونتائج Tests، Web/Android + rollback.
- database backup/restore verification ID؛ owner acceptance.
- old version retention window/QR links monitoring.

**إعلان Production:** لا يتم قبل استيفاء تلك البنود. هذه الوثيقة خطة عملية جارية وليس تصريحًا بأن 0.4.4 جاهز لكل الموظفين.
