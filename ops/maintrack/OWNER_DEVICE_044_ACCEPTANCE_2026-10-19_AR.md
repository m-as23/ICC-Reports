# MainTrack 0.4.4 — سجل قبول Owner على جهاز Android الحقيقي

تاريخ الإفادة: 2026-10-19. مصدر الإفادة: Owner داخل محادثة المشروع، بعد تثبيت ملف `MainTrack-0.4.4-Owner-QA-ONLY.apk` الذي تم إنتاجه في Workflow رقم `39172121032`.

**النطاق: QA/LAB فقط؛ لا يُعد تصريح Production أو Employee Rollout.**

## نتائج مؤكدة بإفادة Owner
- تثبيت التحديث على الجهاز: **PASS reported by Owner**. الجهاز كان يستخدم APK قديمًا `com.icc.maintrack` بنسخة Android `0.4.1 (401)`، والتحديث الاختباري هو `0.4.4 (404)`.
- إضافة بلاغ صيانة جديد: **PASS reported by Owner**.
- حذف بلاغ آخر: **PASS reported by Owner**.
- إضافة قسم جديد: **PASS reported by Owner**.
- لم تُفد المحادثة بأن جلسة تسجيل الدخول بقيت محفوظة بعد **Force close/reopen** أو إعادة تشغيل الجهاز: **PENDING OWNER CONFIRMATION**.
- لم تجرِ إثباتات Offline queue، الأدوار الثلاثة أو Rollback: **PENDING**.
- إفادة Owner قبل الاختبار: **لا توجد بلاغات غير مرسلة على الهاتف**. لذلك لا يُستنتج نجاح حماية Offline queue من التجربة.

## أدلة البناء والمفاتيح
- نسخة APK موقّعة وذات هوية ثابتة، `com.icc.maintrack`، وشهادة Android مطابقة للشهادة الموجودة على الجهاز، `versionCode 404 > 401`: [Signed Owner QA Build](https://github.com/m-as23/ICC-Reports/actions/runs/39172121032) — PASS.
- [Native signing continuity](https://github.com/m-as23/ICC-Reports/actions/runs/39171955007) — PASS.
- شهادة APK الخاصة بالنظام **مختلفة** عن توقيع Ed25519 الخاص بالـOTA.

## استثناء اختبار المحاكي
- [Emulator Run 39193084727](https://github.com/m-as23/ICC-Reports/actions/runs/39193084727) — FAILURE بسبب **CI harness** لا يُظهر خطأ تثبيت فعلي للتطبيق: أداة Android Emulator نفّذت كل سطر Shell منفصلًا، فلم تُحفظ متغيرات `OLD` و`APK`، وكانت الرسالة `adb: filename doesn't end .apk or .apex:` لأن اسم الملف فارغ.
- هذا **لا يحوّل نتيجة Emulator إلى PASS**؛ يحتاج سكريبت تشغيل متكامل ثم إعادة اختبار CI إذا تقررت الحاجة.
- نجح فحص أصالة ملف Android 0.4.1 القديم وملف 0.4.4 الجديد قبل مرحلة المحاكي.

## القرار
- قبول تجربة Owner الحالية كـ **QA device smoke partial PASS** لا أكثر.
- **KEEP PRELAUNCH BLOCKED:** لا يُنشر تحديث للموظفين، ولا تعديل لبيانات Supabase/Vercel Production، ولا إعلان أن استمرارية الجلسة اجتازت الاختبار.
- الإجراء التالي على نفس الجهاز، دون تثبيت جديد: إغلاق MainTrack تمامًا ثم فتحه والتأكد من استمرار الجلسة دون طلب تسجيل دخول. نتيجة هذا الاختبار لازمة قبل علامة Session PASS.
- لا تغيّر نسخة Baseline المجمدة أو ملف توقيع التطبيق أو مسارات OTA الحالية.
