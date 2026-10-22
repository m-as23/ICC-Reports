# MainTrack v0.4.7 — سجل نقاط التحقق (Experimental Only)

تاريخ البداية: 2026-10-22
الحالة: **تجريبي — لا نشر ولا دمج في main/Production**

## ثوابت الحماية
- نسخة الأساس: MainTrack v0.4.6 عند commit `1248211b662981e3e7db27ac0a61ca4d23862ca1`؛ لا تُغيَّر أو يُعاد بناء وظائفها الناجحة لمجرد التحديث.
- فرع العمل: `feature/maintrack-047-integration-20261022` منشأ من SHA المذكور، **وليس من main** (main كان خلف الأساس عند بدء العمل).
- جميع التغييرات تتم على هذا الفرع فقط. لا تعديل على main أو فروع الإصدار المنشورة، ولا Staging DB/Production DB أو خدمات البريد/النشر حتى اجتياز بوابة العزل والتصريح بالنشر.
- النسخ التجريبية تحمل وصف Experimental؛ رقم `v0.4.7` النهائي لا يُعتمد إلا بعد اختبار Web/APK/OTA والعودة وموافقة المالك.
- لا تُتداول رموز الجلسات أو الأسرار أو ملفات Excel الأصلية في المستودع أو تقارير الاختبار.
- نتائج G1 السابقة تُستخدم ضمن حدودها: استرجاع DB المختارة واختبارات وظيفية/صلاحيات محلية = PASS محدد، أما `FULL_BACKUP_VERIFIED=false` و`FULL_APP_RESTORE_VERIFIED=false`، واختبارات الترقية/OTA من الجهاز الفعلي ما زالت غير محسومة. لا يجوز وصفها PASS حتى إثباتها.

## التغييرات المتفق على نطاقها
| ID | المطلوب | ما لا يتغير | الحالة |
|---|---|---|---|
| MT-01 | إضافة عنصر جديد **في آخر** Side Menu لواجهة قطع الغيار (اسم القائمة المقترح: «قطع الغيار»، والعنوان الداخلي ممكن «رصيد المخزن»)، وربط نفس الجلسات والأدوار | ترتيب القائمة وبقية الوظائف وتصميم صفحة القطع الحالي | REQUIREMENT LOCKED؛ اسم العنصر مقترح لحين المعاينة |
| MT-02 | إصلاح تداخل زر «حفظ البلاغ» الثابت مع حقل «تصنيف العطل» على شاشة الهاتف، وفق صورة مرجعية بالطلب | ترتيب الحقول ومنطق البلاغ | REQUIREMENT LOCKED |
| MT-03 | رفض تقديم إجازة مكررة لنفس تاريخ الإجازة برسالة عربية واضحة داخل الفورم؛ التحقق من السيرفر أيضًا | طلبات الإجازة الصحيحة وأرصدة الإجازات | REQUIREMENT LOCKED؛ سياسة حالات الطلب المرفوض/الملغي وتداخل عدة أيام تُحسم بالاختبارات |
| MT-04 | توحيد تسميات نوع الحساب الظاهرة في القائمة الجانبية؛ المقترح عربي: «المسؤول»، «مهندس»، «فني» | أسماء الحسابات الفعلية ودور DB وصلاحيات Owner/Engineer/Technician | REQUIREMENT LOCKED؛ اللغة العربية مقترحة قبل اعتماد المعاينة |
| MT-05 | إيميل بلاغ جديد بلا كلمة Pilot/تجريبي، مع بيانات البلاغ وبداية ونهاية العطل والمدة الإجمالية بصيغة «ساعتان و5 دقائق»؛ اسم مرسل `MainTrack Notifications` | إرسال الإشعارات القديم، لا حذف أو تغيير البيانات المخزنة عن مدد العطل | REQUIREMENT LOCKED؛ تغيير عنوان الإرسال يتطلب دومين موثق منفصلًا ولا يُفترض وجوده |

## قائمة Checkpoints وحالة التنفيذ
| CP | المهمة | بوابة النجاح | الحالة |
|---|---|---|---|
| CP-00 | تحديد النطاق | MT-01..MT-05 موثقة مع المعلّقات الصريحة | PASS — Scope Recorded |
| CP-01A | مصدر أساس غير قابل للخلط | أصل SHA مثبت، فرع تجريبي مستقل، سجل قرارات | PASS — Repository Preparation |
| CP-01B | QA isolation preflight | هوية بيئة DB/API/host + rollback للبيانات الاختبارية + عدم توجيهها إلى Production | PARTIAL — مشروع QA منفصل موجود، لكنه لا يضم كل جداول Staging؛ NO DEPLOY |
| CP-02 | MT-02 واجهة البلاغ | Screenshots قبل/بعد + mobile viewport + اختيار التصنيف والحفظ بدون تداخل | CSS PATCH COMMITTED — VISUAL/REGRESSION TEST PENDING |
| CP-03 | MT-03 تكرار الإجازة | التحقق من الطلبات المتداخلة على السيرفر، رفض التكرار دون مضاعفة البيانات | NOT STARTED |
| CP-04 | MT-04 مسميات الأدوار | عرض عربي موحد لجميع الأدوار بدون تغيير الصلاحيات | NOT STARTED |
| CP-05 | MT-05 البريد والزمن الإجمالي | بريد QA صحيح مرة واحدة، قياس عبر منتصف الليل، مصدر وقت البداية والنهاية موثوق | NOT STARTED |
| CP-06 | MT-01 محرك البحث والدمج | آخر عنصر Side Menu، عرض حسب الدور، البحث العربي/الإنجليزي ووحدات 65A، رفع/مقارنة/اعتماد/أرشيف Owner، Reject غير المالك | NOT STARTED |
| CP-07 | Regression + security + performance | تغطية التغييرات وأثرها على الوظائف الأساسية دون تكرار اختبارات ثابتة بلا داع | NOT STARTED |
| CP-08 | Web/APK/OTA upgrade + rollback | اختبارات إصدار وصلاحيات وبناء وتوقيع وترقية وبقاء بيانات وقدرة الرجوع موثقة | NOT STARTED |
| CP-09 | موافقة المالك والنشر | لا يُنشر إلا بعد PASS واضح لكل بوابات الإصدار وموافقة صريحة | BLOCKED — APPROVAL REQUIRED |

## مصادر أعمال قطع الغيار الحالية (دون نسخ بيانات فعلية)
- Repo: `m-as23/SpareParts-Search-Lab`.
- مرجع Backend مستقل: `feature/inventory-staging-real-session-private-bucket-20261020`.
- يُراجع تصميم `backend/INTEGRATION_PLAN_AR.md`، `backend/REAL_STAGING_SESSION_BUCKET_AR.md` وعمليات Auth/Storage/Inventory قبل النقل.
- Backend معزول جزئيًا، الجلسات MainTrack opaque tokens، لا نظام Supabase Auth آخر. Bucket خاصة موجودة في Staging، لكن ربط تدفق اعتماد Excel الحقيقي / البحث / الاستعادة يحتاج إثباتًا منفصلًا.
- التحقق من اختلاف هيكل بيانات الواجهة القديمة وآليات نشر Web وAPK جزء أساسي من بوابة الدمج. لا نقل HTML مضمّن به جرد أصلي إلى GitHub.


## تنفيذ 22 أكتوبر 2026 — تقدم موثق
- Branch: `feature/maintrack-047-integration-20261022`, root commit `1248211b662981e3e7db27ac0a61ca4d23862ca1`.
- بدأ MT-02 بتعديل CSS محدود على هذا الفرع فقط: `web/maintrack/public/v6.css` و`index.html`. يضيف Mobile scroll clearance داخل `main#form` عند العرض ≤700px فوق زر الحفظ الثابت. لا JavaScript ولا DB ولا تغيير لترتيب الحقول.
- Commits: `6525c689c93f1b6f5681c0ddb2769c3715179558` و`0892b83a348f4f1135abca4a14bbd696db31b058`.
- GitHub compare مقابل Baseline أعطى فقط 3 ملفات متغيرة: وثيقة الـCheckpoints وملفا CSS/HTML؛ لا تغيير للوظائف أو SQL. هذا إثبات Diff، **وليس اختبارًا بصريًا ناجحًا**.
- فحص Supabase للقراءة فقط: `MainTrack-RBAC-QA-Isolated` مشروع منفصل ونشط، لكنه يحوي جداول QA أساسية فقط ولا يساوي مخطط Staging الكامل. لا تشغيل write E2E عليه أو على Staging حتى اعتماد baseline والـAPI المناسبين.
- `web/maintrack/source-lock.json` يحتوي fingerprints من مرجع قديم؛ تغيّر `v6.css` يجعلها غير مطابقة من دون توليد provenance إصدار جديد. **لا نغير lock التاريخي ولا ندّعي جاهزية Native/Web packaging**. سيُعالج عند بوابة build التجريبية بشكل يحافظ على مصدر الإصدار.
- الحالة: CP-01A PASS؛ CP-01B PARTIAL؛ CP-02 CODE PATCH ONLY؛ CP-03..CP-09 PENDING. لم يُنشَر أي تحديث ولم تُلمس Production أو Staging.

## نموذج إقفال كل نقطة
- Timestamp (Cairo):
- Source commit / PR:
- Tests (PASS/FAIL/BLOCKED):
- Evidence (CI/report/screenshot without secrets):
- Baseline regression: unchanged / observed issue:
- Decision: PASS / FAIL / BLOCKED:
- Owner review (when required):

**هذه الوثيقة تسجل خطة التنفيذ ولا تعني اعتمادًا تشغيليًا لأي نقطة لم تُختبر.**
