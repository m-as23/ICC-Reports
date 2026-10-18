# MainTrack — خطة تنظيف الموارد القديمة دون تعطيل التطبيق

تاريخ الجرد: 18 أكتوبر 2026. **حالة التنفيذ: تحديد وتصنيف فقط، لا عمليات حذف.**

## Vercel: 13 مشروعًا بما فيها مشروع Production الجديد

| Vercel Project | التصنيف الحالي | القرار المؤقت |
|---|---|---|
| `maintrack-production` | المشروع الرسمي الجديد، لا Deployment ولا Domain بعد | KEEP: تجهيز Production |
| `maintrack-final-security-qa` | آخر Preview مُجرب للواجهة 0.4.4 | KEEP QA كمرجع قبل إطلاق Production |
| `maintrack-pilot-icc` | أصل Pilot قديم وروابط قد تكون موجودة | KEEP مؤقتًا حتى فحص QR و CORS و traffic |
| `maintrack-unified-operations-v5` | تطبيق سابق للواجهات | DEPRECATION CANDIDATE بعد فحص المراجع |
| `maintrack-corrective-v6` | مراجعة تصحيحية سابقة | DEPRECATION CANDIDATE |
| `maintrack-navigation-fixed-v4` | نسخة مراجعة تنقل قديمة | DEPRECATION CANDIDATE |
| `maintrack-navigation-fixed-v3` | نسخة مراجعة تنقل أقدم | DEPRECATION CANDIDATE |
| `maintrack-navigation-pilot-review` | نسخة مراجعة تنقل | DEPRECATION CANDIDATE |
| `maintrack-security-bundle-audit` | تدقيق بنية/أمان | DEPRECATION CANDIDATE |
| `maintrack-security-stage9-review` | تدقيق Stage9 | DEPRECATION CANDIDATE |
| `maintrack-csp-hardened-qa` | تجربة CSP | DEPRECATION CANDIDATE |
| `maintrack-stage7-app-staging` | تطبيق staging أقدم | DEPRECATION CANDIDATE |
| `maintrack-stage6-api-staging` | مشروع staging من مرحلة أقدم، لا latest deployment ظاهر | DEPRECATION CANDIDATE |

**لا تفترض أن مشروع Vercel عليه target='production' هو مشروع الموظفين.** بعض المشاريع التجريبية تظهر Production تقنيًا فقط لأنها نُشرت في بيئتها الافتراضية. لا تستخدم هذا معيارًا للحذف.

## GitHub

- `main`: فرع تاريخي يحتوي جزءًا من تطبيق Google Apps Script القديم. لا نمسحه قبل اختيار Default Branch رسمي جديد.
- `baseline/maintrack-v0.4.4-owner-verified-20261018`: تجميد مرجع المصدر، KEEP.
- `ops/maintrack-044-production-foundation-20261018`: خطة الإنتاج وخريطة المصادر والاختبارات، KEEP لحين دمجها في فرع الإنتاج النهائي.
- `android/stage14-ota-native-lab`: **KEEP** لأن manifest OTA الموقّع والـZIP موجودان عليه ويعتمد عليه التطبيق المثبت.
- `release/maintrack-stage22-044-integration` و`release/maintrack-stage22-web-android-20261018`: **KEEP** حتى توثيق الاسترجاع وربط الـSHA وتكوين Git tag أو release archival.
- فروع Android stage11/12/13 وfeature/fix/QA القديمة: مرشحة للحذف فقط بعد ترحيل ما يلزم إلى تاريخ مصدري مؤرشف وفحص build/release dependencies.

**ملاحظة بخصوص المساحة:** Git histories وActions build artifacts لا تتحرر فورًا بمجرد حذف Branch. بعض artifacts تنتهي تلقائيًا. لا نحذف audit evidence قبل تصديره.

## Supabase

المشروع الموجود: `MainTrack-Staging`، 23 جدولًا و32 migration، مع سجلات اختبار/تجريب قديمة لم تُفصل بوضوح.
- `maintrack-unified-four-qa` v15: KEEP؛ الإصدار 0.4.4 على Android LAB يعتمد عليه ويضم 32 action.
- `maintrack-stage9-security-api` v10: KEEP حتى اكتمال الترحيل والتوافق القديم، يضم 26 action.
- `maintrack-pilot-mail-worker`: KEEP حتى اختبار notification/email/cron.
- `maintrack-stage6-api`, `maintrack-stage6-health`, `maintrack-stage22-release-canary`: مراجعة logs وcalls وCI/cron، ثم إلغاء بعد إثبات عدم الاعتماد.
- قاعدة البيانات الأصلية وكل `mt_*` والـsecrets وAuth: **عدم الحذف مطلقًا في خطوة تنظيف Hosting**. تنظيف test data خطة منفصلة بنسخة backup وإقرار Owner بالجدول والسجلات.

## قبل كل حذف (الإجراء الملزم)

1. احفظ Resource ID والـdomain والـcommit/sha والحالة والتاريخ في سجل.
2. راجع QR وروابط رسائل البريد والـnotification وAPI/CORS وGitHub workflows، ومَن يستدعي المورد.
3. احفظ نسخة بديلة قابلة للاستعادة، وأثبت أن الروابط المقرر حذفها لا تعمل في الإنتاج الجديد ولا يتصل بها جهاز موظف.
4. قم بمرحلة تعطيل/عزل محسوبة للموارد التي يمكن إيقافها دون فقد بيانات، مع مراقبة التطبيق الرسمي وعمل Regression tests.
5. فقط بعد فترة مراقبة معتمدة وقبول Owner الصريح، نفّذ الحذف دائمًا **واحدًا واحدًا** وسجّل الـID والنتيجة.

## ترتيب تنظيف مقترح بعد الـGo-live

1. مشاريع Vercel الخاصة بالتدقيق ونسخ navigation القديمة **بعد** فحص alias traffic والـQR.
2. مشاريع staging القديمة على Vercel بدون مستخدمين مثبتين.
3. GitHub stale feature/fix branches غير المرتبطة بمراجع release أو signed OTA.
4. Supabase Edge functions الأقدم **بعد** tracing requests/cron والتأكد من سلامة البريد والإشعارات.
5. Test data في قاعدة staging وفق عملية منفصلة؛ لا تخلطه بحذف المشاريع.

الهدف المستقبلي: Production Vercel واحد، QA Vercel واحد، GitHub source واضح ذو tags/branches محكومة، Production Supabase معزول، Staging Supabase للاختبارات، Android release/OTA تحت هوية موثّقة.
