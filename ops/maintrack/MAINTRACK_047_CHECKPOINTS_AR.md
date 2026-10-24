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
| CP-01B | QA isolation preflight | هوية بيئة DB/API/host + rollback للبيانات الاختبارية + عدم توجيهها إلى Production | PARTIAL — QA isolated فيه mt_leave_requests ولكنه ليس نسخة كاملة من Staging؛ NO DEPLOY |
| CP-02 | MT-02 واجهة البلاغ | Screenshots قبل/بعد + mobile viewport + اختيار التصنيف والحفظ بدون تداخل | PASS — ISOLATED CHROMIUM 360/390/412/600 (74–79px GAP); APK/REAL DEVICE PENDING |
| CP-03 | MT-03 تكرار الإجازة | التحقق من الطلبات المتداخلة على السيرفر، رفض التكرار دون مضاعفة البيانات | SOURCE PATCHED + READ-ONLY SQL 6/6 PASS — AUTHENTICATED E2E PENDING |
| CP-04 | MT-04 مسميات الأدوار | عرض عربي موحد لجميع الأدوار بدون تغيير الصلاحيات | FIXED CANONICAL v6-core.js SIDEBAR ROLE TEXT; NEW STATIC CI PENDING |
| CP-05 | MT-05 البريد والزمن الإجمالي | بريد QA صحيح مرة واحدة، قياس عبر منتصف الليل، مصدر وقت البداية والنهاية موثوق | WORKER SOURCE PREPARED — PURE DURATION TESTS PASS; RESEND SEND/DEPLOY PENDING |
| CP-06 | MT-01 محرك البحث والدمج | آخر عنصر Side Menu، عرض حسب الدور، البحث العربي/الإنجليزي ووحدات 65A، رفع/مقارنة/اعتماد/أرشيف Owner، Reject غير المالك | UI NAVIGATION + FAIL-CLOSED PREVIEW COMMITTED — INVENTORY SCHEMA/REAL SEARCH BLOCKED; NEW BROWSER QA PENDING |
| CP-07 | Regression + security + performance | تغطية التغييرات وأثرها على الوظائف الأساسية دون تكرار اختبارات ثابتة بلا داع | INITIAL ISOLATED CI PASS (39814496034); SOURCE ATTESTATION + MOBILE QA LATEST COMMIT PENDING |
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


## تحديث تنفيذي — 22 أكتوبر 2026 (متابعة)

### تغييرات المصدر المؤكدة على فرع 0.4.7 فقط
1. **MT-02**: مساحة أسفل نموذج البلاغ في CSS canonical web؛ المعاينة على الهاتف لم تُثبت بعد. لا تغييرات على submit JS.
2. **MT-03**: فحص stage9 API source ومنشور Staging أكد وجود قفل row بـ \`SELECT ... mt_users FOR UPDATE\` ورفض تداخل \`PENDING\` أو \`APPROVED\` عبر \`OVERLAPPING_LEAVE_REQUEST\` منذ أساس v0.4.6؛ لم نكرر هذا المنطق. أصلحنا رسالة الخطأ في \`web/maintrack/public/secure-assets/index-inline-1.js\` داخل \`leaveFeedback\` مع إبقاء idempotency. اختبار PostgreSQL read-only على مشروع QA منفصل (CTE VALUES فقط، بلا INSERT/UPDATE) = **6/6 PASS** لحالات نفس التاريخ والتداخل والرفض وعدم التداخل. اختبار E2E المصادق باستخدام الحسابات ما زال مطلوبًا.
3. **MT-04**: عرض \`owner=المسؤول\`، \`engineer=مهندس\`، \`technician=فني\` في طبقة واجهة Web (جدول تسميات فقط)، دون تغيير backend role أو authorization. الاختبار المرئي للأدوار الثلاثة معلق.
4. **MT-05**: جلبنا كود Mail Worker المنشور للقراءة فقط كخط أساس، وأنشأنا مصدرًا جديدًا **غير منشور** عند \`supabase/functions/maintrack-pilot-mail-worker/index.ts\` + \`deno.json\`. عنوان الرسالة دون Pilot أو تجريبي، اسم العرض \`MainTrack Notifications\` مع الحفاظ على \`sender_email\` المعتمد؛ أضفنا أوقات \`report_time\` و\`work_start_time\` و\`work_end_time\` من تقرير السيرفر مع نص عربي لمدة الإبلاغ إلى انتهاء الإصلاح، وعبور منتصف الليل. الحفاظ على \`mt_outbox\` وIdempotency-Key ومعالجة الإخفاق. اختبارات helper النقية **9/9 PASS** وفحص syntax للمصدر بعد إزالة أسطر imports PASS. لا إرسال بريد ولا تغيير Resend أو Supabase deploy.
5. اختبار Syntax/Static للواجهة ومسار backend/email: **11/11 فحص مصدر PASS** ضمن هذا التنفيذ؛ ليس بديلًا عن اختبار المتصفح الحقيقي. تمت إضافة \`ops/maintrack/tests/test_047_static.cjs\` واختبار CI جديد \`.github/workflows/maintrack-047-isolated-qa.yml\`، للقراءة فقط، بدون أسرار أو نشر. أول تشغيل للـCI الجديد ظهر **QUEUED** عند المراجعة، وليس PASS.
6. إعادة \`index.html\` القديم في جذر المستودع إلى نفس Git Blob SHA لإصدار v0.4.6 = \`cce9a8ac3f6b25c98d921810eea5166a45d359e7\`. ملف الجذر ليس canonical Web الحالي. تعديل الجذر سابقًا سبّب \`UNKNOWN_UPDATE_SURFACE_REQUIRES_REVIEW\` وفشل QA؛ أصلحناه دون مساس بأساس v0.4.6. Git diff للفرع الآن لا يتضمن \`index.html\`.
7. بوابة \`MainTrack — Change QA Gate\` القديمة مثبتة على \`PINNED_SOURCE_GIT_BLOB=25f37b928eba7857d7ddff08362f575ee1224971\` خاص بـQA عميل 0.4.5 وتُفشل التحديث المقصود للـcanonical JS برسالة \`UNREVIEWED_CANONICAL_WEB_JS_CHANGED\`. **لم نعطّل القفل ولم نغيّر الـpin القديم**، وأعددنا بوابة منفصلة مصغّرة للإصدار الجديد. يلزم مصدر/بصمة معتمدان للإصدار الجديد قبل بناء Web/APK/OTA.
8. **Vercel**: كشف المشاريع للقراءة فقط؛ لا Preview Deployment موجود لهذا الفرع وقت الفحص. **Resend**: التطبيق المتصل أعاد \`No domains found\`؛ هذا لا ينفي صلاحية دومين إرسال تابع لاعتماد مختلف. بيانات البريد الموجودة على Staging أظهرت (قراءة أعلام فقط) \`enabled=true\`, \`provider=resend\`, وsender address valid format، لكن لا إثبات ارسال 0.4.7 عبر الاتصال الحالي.
9. لا تعديلات SQL أو RLS أو Supabase Functions المنشورة أو Vercel production/preview أو Resend، ولا إيميلات فعلية أو APK/OTA.

### الأدلة وروابط المتابعة
- Branch GitHub: https://github.com/m-as23/ICC-Reports/tree/feature/maintrack-047-integration-20261022
- New isolated v0.4.7 CI queued run: https://github.com/m-as23/ICC-Reports/actions/runs/39814496034
- Historical 0.4.5 gate failed (expected due to new JS fingerprint): https://github.com/m-as23/ICC-Reports/actions/runs/39812997073
- لا نعتبر CP-02 أو CP-03 أو CP-04 أو CP-05 «PASS نهائيًا» قبل التحقق على Preview آمن ومعاينة الوظائف؛ CP-09 ما زال BLOCKED.


### CP-02 / Attestation — بوابة التحقق الإضافية
- تنفيذ \`ops/maintrack/scripts/attest-047-source.mjs\`: يتحقق من parent SHA الموافق للإصدار v0.4.6، ويبقي \`index.html\` القديم و\`web/maintrack/source-lock.json\` بلا تغيير. يتحقق من PIN السابق للـJS (0.4.5 = \`25f37b9...\`)؛ يُنشئ ملف audit للبصمات الجديدة دون تغيير القفل التاريخي أو السماح بالنشر.
- تنفيذ \`ops/maintrack/tests/test_047_mobile.browser.mjs\`: اختبار Chromium بواجهة محلية **بلا JavaScript للتطبيق أو تسجيل دخول أو Supabase** عند عروض 360/390/412/600px؛ يقيس موضع \`#cat\` مقابل \`#send\` بعد التمرير، ويحفظ screenshots كأدلة CI.
- تحديث \`.github/workflows/maintrack-047-isolated-qa.yml\` لإضافة source attestation + mobile Chromium job؛ الاختبارات لا تصدر Web أو APK ولا تستدعي خدمات تشغيلية.
- أول بوابة source/static منفصلة كانت **PASS** في GitHub run \`39814496034\`. البوابة المحدثة ذات Chromium وبصمات المصدر تحتاج إثبات PASS على **آخر Commit** بعد استقرار CI.
- عند تحرير قالب البريد للمراجعة النهائية، تم حصر محتواه في رقم البلاغ والقسم والماكينة والموظف والتاريخ ووقت بداية العطل (\`report_time\`) والمدة الكلية (\`report_time\` → \`work_end_time\`) والوصف والحل؛ إخفاء \`work_start_time\` و\`work_end_time\` المستقلين من البريد مع الاستمرار في استخدامهما كمصدر بيانات. تنسيق الوقت AM/PM واختبارات وحدة له. \`maintrack-pilot-mail-worker\` في Supabase لم يُنشر منه تحديث.
- المنع الحاسم: Gate الخاص بـ0.4.5 ما زال PINNED وغير مناسب لتغييرات canonical JS الجديدة؛ فشله **لا يجوز تغييره إلى PASS** عبر تعديل البصمة القديمة. قبل Build/Preview لـv0.4.7 يلزم التحقق من قنوات الـAPI المنعزلة وتوليد سياسة source release جديدة مع اعتماد محدد للإصدار.
- NOTE: المصدر الذي يجري اختباره لا يتيح فعليًا وصول مستخدم إلى «بلاغ جديد» إلا عبر جلسة؛ اختبار التداخل الحالي **بصري محلي معزول**، وليس E2E مُصادقًا ولا APK على Oppo.


### نتائج Chromium مؤكدة للـMT-02 + إصلاح الـMT-04 الحقيقي
- GitHub Actions \`39816104121\` أنجز **PASS في الوظيفتين** (Static/Attestation وBrowser). خرجت قياسات Browser من log: عرض 360 → 79px؛ 390 → 79px؛ 412 → 79px؛ 600 → 74px بين نهاية حقل التصنيف وبداية زر الحفظ، مع تسجيل screenshots في Artifact؛ اختبار معزول لا يجرب حساب موظف حقيقي أو APK.
- المصدر المرجعي للصلاحيات في Side Menu وجد فعليًا في \`web/maintrack/public/v6-core.js\` بنص \`Owner / المسؤول\` و\`Engineer / مهندس\` و\`Technician / فني\`. تم تعديل **تلك السلسلة وحدها** إلى \`المسؤول\` و\`مهندس\` و\`فني\` مع fallback، دون مساس بأي قائمة أو صلاحيات. تم إدراج الملف في allowlist لفحص بصمات v0.4.7 وإضافة اختبار ثابت لاختفاء المسميات المختلطة؛ نتيجة CI الجديدة قيد التحقق.
- لا تزال نسخة \`v0.4.6\` معتمدة كنقطة رجوع للمصدر وممنوع النشر قبل CP-08/CP-09.


### CP-06 / MT-01 — دمج واجهة مبدئي وتجهيز Backend معزول (22 أكتوبر 2026)
- تم فحص \`SpareParts-Search-Lab\` عند \`07dbac0c2a63cf58336ae8a2df383cbcf9f283be\`. إجراءات Backend وQA المستقلة في ذلك المستودع ناجحة عند الـSHA المرجعي، لكنها ليست اختبار دمج حقيقي ببيانات MainTrack.
- استعلام metadata **للقراءة فقط** في \`MainTrack-Staging\`: جلسات \`mt_users\` و\`mt_sessions\` موجودة (2/2)، \`maintrack-inventory-archive-staging\` Bucket خاصة صحيحة (1/1)، لكن \`inv_lab\` غير موجودة (0 schema, 0 tables). مشروع \`MainTrack-RBAC-QA-Isolated\` لا يحتوي \`inv_lab\` أو bucket مماثلة. لم يُنفذ \`001_inventory_core.sql\` على أي بيئة.
- تعديلات الويب على فرع v0.4.7 فقط: \`web/maintrack/public/index.html\` زر \`tabInventory\` وحيد **في آخر القائمة** وصفحة \`inventory\`؛ \`v6.js\` يحافظ على ترتيب العناصر الثمانية القديمة ويضيف التاسع؛ \`v6-core.js\` أيقونة العنصر الجديد دون مساس بالأيقونات القديمة؛ \`secure-assets/index-inline-1.js\` تنقل يستعمل جلسة التطبيق الموجودة ويظهر العنصر للأدوار \`owner/engineer/technician\` فقط؛ \`inventory-047.css\` تصميم scoped لا يؤثر على بقية التطبيق.
- **وضع Fail-closed:** يُظهر عنوان رصيد المخزن ومكان البحث/الرفع/الأرشيف، ولكن يُبقي البحث والرفع والاعتماد والاستعادة **معطلة** حتى تطبيق Backend موثق وفحص الجلسات والصلاحيات ومطابقة Excel. لا بيانات جرد أصلية في GitHub ولا بيانات أو أرقام وهمية في الواجهة. هذه ليست الصفحة النهائية لبحث V9؛ سيتم نقل التصميم والمزايا بعد تهيئة API ولقاء القبول البصري.
- Owner يرى منطقة الإدارة (معطلة)؛ Engineer/Technician يستطيعان فتح القسم دون أدوات مالك. صلاحيات الخادم لم تُنفذ بعد لذلك لم نعلن هذا RBAC أمنيًا كاملًا.
- أضيف اختبار Static عبر \`test_047_static.cjs\` للتحقق من ترتيب القائمة والثلاثة أدوار وحالة إيقاف البحث، وأضيف اختبار Chromium مستقل \`test_047_inventory.browser.mjs\` لواجهات 360/390/412/600px والتقاط screenshot ومنع أي اتصالات API في الاختبار.
- التوقف التالي: مراجعة تصميم V9 بدون Excel المضمّن، عقد API واضح، تجربة PostgreSQL خاصة مع تصاريح دقيقة وRLS/REVOKE، وبعدها \`Staging\` Migration بموافقة صريحة وBackup ثم تنفيذ اختبارات Session/Owner-only/Search/Upload/Archive. لا اعتماد CP-06 كاملًا قبل ذلك.
- آخر نتائج Vercel عند الفحص: صفر deployments للفرع v0.4.7 على مشروع \`maintrack-production\`. Resend connection: \`No domains found\`، لذا لا بريد فعلي من هذه الجلسة ولا تحديث لمرسل الرسالة. لا Live Supabase deploy أو نشر Vercel أو APK/OTA.
- تم إغلاق CI رقم \`39816950302\` بنتيجتي **PASS** وأدلة screenshots+bom، قبل إضافة UI؛ البوابة الجديدة للدمج لا تعلن PASS إلى أن تؤكد Actions الجديدة نجاح نفس الـCommit.



### CP-06 / SQL review-only contract (22 أكتوبر 2026)
- تم نقل مخطط قاعدة بيانات قطع الغيار \`inv_lab\` واختبار نسخ V1→V2→V3 إلى \`ops/maintrack/inventory/001_inventory_core.review.sql\` و\`ops/maintrack/inventory/test_inventory_disposable.sql\` دون أي Excel فعلي، من نسخة Lab المثبتة SHA \`07dbac0c2a63cf58336ae8a2df383cbcf9f283be\`.
- الملفات خارج \`supabase/migrations/\` عمدًا. ليست migrations قابلة للتشغيل التلقائي أو منشورة، وهي للاختبار والمراجعة فقط.
- تم تجهيز GitHub Actions Job \`qa-047-inventory-sql\` بقاعدة PostgreSQL 16 **مؤقتة**، لإنشاء نفس المخطط مرتين (Idempotency) ثم اختبار المقارنات والأرشفة ورفض النسخة المتقادمة والاستعادة وحماية Schema من PUBLIC. الاختبار SQL يستخدم معاملات تنتهي بـ ROLLBACK ولا يتصل بـ Supabase.
- تم إضافة الملفات إلى بصمات مراجعة إصدار 0.4.7 المستقلة، **لا** إلى PIN التاريخي أو قائمة ملفات الإنتاج.
- نجاح هذا الاختبار يثبت صحة بعض قواعد البيانات في عزل CI فقط؛ لا يثبت صلاحية API الحية أو Owner/Technician E2E. لا يُطبق المخطط على Staging حتى فحص النسخة الاحتياطية والموافقة على migration منفصل.



### CP-06 — نتيجة فحص API + مصادقة + البحث التجريبي (22 أكتوبر 2026)
- الأدلة المنفذة في GitHub Actions: SQL معزول PASS بتاريخ تشغيل \`39819963498\`؛ واجهة mobile/Owner-only/session contract PASS بتاريخ تشغيل \`39821409481\`. كلاهما Offline أو PostgreSQL disposable فقط وليس Production/E2E.
- جرى نقل وحدات \`domain.mjs\`, \`http-adapter.mjs\`, \`maintrack-session-adapter.mjs\` من SpareParts Lab SHA \`07dbac0c2a63cf58336ae8a2df383cbcf9f283be\` إلى \`ops/maintrack/inventory/backend/src/\` للمراجعة والاختبارات فقط، مع تأهيل استعلامات المصادقة لاستهداف \`public.mt_sessions\` و\`public.mt_users\` صراحة.
- أضيف اختبار \`session-adapter.test.mjs\`: تأكيد SHA-256 للجلسة، انتفاء تمرير رمزها للنص SQL، انتهاء صلاحية الحساب وإعادة كلمة المرور، منع انتحال Owner بالـJSON، الفصل بين Owner وEngineer وTechnician. جلسات وهمية فقط.
- اكتُشف فرق وظيفي مؤثر: \`PostgresInventoryStore.search\` في الـLab الحالي يطابق جزءًا حرفيًا من كود/وصف فقط؛ **لا يحقق بمفرده** \`65A↔65 أمبير\` و\`Parker↔باركر\` ومتطلبات البحث الدقيقة. لم يُنسخ كمسار بحث إنتاجي ولم يُفعّل.
- أضيف Pure matcher مستقل \`search-normalizer.mjs\` يفهم بعض المرادفات والوحدات والنماذج، مع اختبار أمثلة صناعية \`Parker M700 / انفرتر باركر / 65A / 65 أمبير / 90L\` واختبارات رفض \`165A\` و\`190L\` وBearing حرف A. **ليس متصلاً بالبحث الحي**؛ لا تُعتبر دقة المخزن النهائية معتمدة قبل تطبيقه على أحدث Snapshot فعلي وفحص Precision/Recall لكل الحالات.
- حالة Staging الفعلية: \`inv_lab=0\`؛ Bucket خاصة = 1؛ وظائف Supabase الحالية تشمل جسر \`inventory-session-storage-staging\` الذي يجرب الجلسة والـBucket فقط، ولا يقدم \`inventorySearch\` أو \`inventoryDraft\` أو \`inventoryPublish\` حتى الآن.
- Gate \`MainTrack — Change QA Gate (Staging Only, No Deployment)\` القديم أظهر **FAIL** عند الفحص على SHA \`fe975bd\` بسبب اختلافات مصدر v0.4.7 عن توقعات اختبار قديم؛ لا يعني نجاح Workflow v0.4.7 الجديد إغلاق هذا الحاجز. **Release: NOT READY** حتى توثيق الاستثناء المقصود أو إصلاح CI دون كسر الحماية التاريخية.
- **P1 مانع إصدار:** عدم وجود \`inv_lab\` على Staging، ولا API مخزن تنفذ العقد الفعلي، ولا اختبارات E2E Auth/Owner approval/Excel، مع \`FULL_APP_RESTORE_VERIFIED=false\`. لا إجراء تلقائي على Staging بدون اعتماد Backup/موافقة مستقلة.
- Vercel: استعلام القائمة لم يُظهر Preview Deployment للفرع؛ لذلك لم يُختبر URL منشور. Resend: الاتصال الحالي لم يُظهر نطاق إرسال، ولم يُرسل أي بريد.
- الخطوة التالية: تفعيل API مراجَعة فقط بعد تثبيت Backend Store، ثم تجربة Postgres + Excel صناعي + session RBAC في عزل، ومراجعة الـRate Limits وعقد API ثم Migration على Staging بموافقة صريحة، وأخيرًا اختبار QA browser/APK وتشغيل Canary آمن.


### CP-06 follow-up — isolated store, Owner review and legacy QA separation (22 أكتوبر 2026)
- المصدر التجريبي المراجَع حاليًا: \`feature/maintrack-047-integration-20261022\`; النسخة 0.4.6 و\`main\` وProduction لم تُعدّل.
- فصل خاص بالفرع 0.4.7 فقط في \`.github/workflows/maintrack-change-qa.yml\`: خطوات Legacy QA تعتمد Checkout SHA ثابت \`1248211b662981e3e7db27ac0a61ca4d23862ca1\` وترفض أي اختلاف في \`HEAD\`. هذا **لا** يغيّر \`PINNED_SOURCE_GIT_BLOB\` التاريخي. باقي الأفرع لا تتغير. Workflow \`maintrack-047-isolated-qa.yml\` يتأكد من مصدر 0.4.7 نفسه.
- بوابة Legacy بعدما أعيد تشغيلها على المصدر المثبت: نجح Unit/Release وتحقق API Staging read-only، لكن تشغيل سابق \`39824111082\` فشل في سيناريو Chromium \`owner edits, catalog entries and an open work-order editor\` بسبب عدم ظهور \`#v6Editor\` خلال 10 ثوانٍ (22/23 Browser tests نجحت). الاختبار جديد هنا على نفس مصدر 0.4.6 التاريخي؛ السبب الوظيفي لم يُحسم، ولا يُلغي نجاح 0.4.7 المعزول الحاجة لفحصه.
- أُعدت \`postgres-store.mjs\` من مصدر SpareParts Lab المثبت مع استبدال literal substring search بمحرك \`search-normalizer.mjs\`. يقرأ فقط \`inv_lab.active → versions(current,sealed) → items\`، ويرد نتائج صفوف أصلية دون تخمين كميات، ويفشل عند >30000 صف بدل الاقتصاص الصامت. هذه **وحدة قراءة غير منشورة** ولم تُختبر على Excel حقيقي بعد.
- أضيفت \`inventory-service.mjs\` بخدمة \`inventoryDraft / inventoryDiff / inventoryPublish / inventoryHistory / inventoryRestore\` في وضع المعاينة فقط: تحميل لا يساوي اعتمادًا؛ Receipt من SHA-256 مربوط بالـDiff؛ رفض Stale Base؛ موافقة إضافية للحذف الجماعي؛ Backend Server identity هو الوحيد الذي يحدد صلاحية Owner. Parser ملف XLSX مطلوب حقنه صراحة، ومفقود حاليًا في MainTrack، لذا **Upload الحي مغلق**.
- الاختبارات الجديدة على بيانات صناعية: \`postgres-search.test.mjs\` و\`inventory-service.test.mjs\`، بالإضافة إلى Auth/HTTP/SQL/browser؛ آخر تشغيل للمسار المستقل \`39824426064\` **PASS في الوظائف الثلاث** (Static + Mobile Chromium + PostgreSQL disposable).
- تحقق Supabase Staging read-only: \`inv_lab\` غير موجودة، \`maintrack-inventory-archive-staging\` Bucket خاصة موجودة. تحقق Vercel: صفر Preview Deployments لفرع 0.4.7؛ لا URL حقيقي مختبر ولا إصدار APK.
- Supabase Security Advisors: 23 جدولًا عليها RLS دون Policy (INFO، قد يكون مقصودًا لقاعدة Server-only؛ لا يعد ثغرة مثبتة)، وتحذير \`pg_net\` داخل \`public\` (WARN)، و12 فهرسًا غير مستخدم (INFO). لا تُعدل الأذونات أو تنقل امتدادات في هذه المرحلة دون تحليل أثر منفصل.
- **BLOCKED / NOT READY**: مطلوب Parser XLSX آمن ومثبت وتحقق Archive Storage + HTTP route، اختبار بحث/صحة بيانات حقيقية، اختبارات جلسات Staging الحقيقية/موافقة Owner/الضغوط، ومراجعة نتيجة اختبار محرر البلاغ التاريخي، بالإضافة إلى \`FULL_APP_RESTORE_VERIFIED=false\` وبوابة Backup قبل أي Migration.
- Supabase Edge Function حين تستخدم MainTrack opaque bearer بدلاً من Supabase JWT يجب إعداد Platform JWT check وفق نمط Auth خاص آمن ومراجَع، **وليس** الاعتماد على تعطيله وحده؛ لن يُنشر أي Endpoint بدون Server-side session verification ورقابة Rate Limit.
- لا تنفيذ Schema/SQL أو Storage upload أو بريد Resend أو نشر Vercel أو توقيع OTA/APK في هذه الجولة.


### CP-06 continued — real XLSX parser and exhaustive pagination (22 أكتوبر 2026)
- تم نقل \`import-xlsx.mjs\` و\`private-bucket.mjs\` كما هما من مصدر SpareParts Lab المثبت \`07dbac0c2a63cf58336ae8a2df383cbcf9f283be\` إلى فرع 0.4.7 التجريبي. الرفع على Supabase **لم** يُنفذ، والكود لم يُنشر.
- أضيفت \`create-review-runtime.mjs\` تربط حصريًا \`verifySession\` الموثّق على السيرفر، وPostgreSQL pool المقيّد، وPRIVATE storage bucket، وParser المكتبة الحقيقية. لا تعرض أي pool أو storage credentials للعملاء، ولا تنشئ HTTP endpoint عند استيرادها.
- تمت إضافة \`package.json\` و\`package-lock.json\` مُقفلين مع \`exceljs@4.4.0\` و\`yauzl@3.2.0\`، وأصبحت CI تستخدم \`npm ci --ignore-scripts\`. Lockfile ولّدته بيئة GitHub Actions التجريبية ثم أُضيف للمستودع، وليس إلى Production.
- نتيجة الاختبارات الأولية الحقيقية باستخدام ملفات Excel صناعية: 10 اختبارات Parser/Private Bucket/Owner import flow **PASS** في تشغيل \`39828313445\`، مع SHA لاطلاع Source Attestation. أُضيفت لاحقًا حالة 3920 صنف اصطناعي واختبارات Pagination؛ يلزم انتظار **نتيجة آخر Commit** قبل اعتمادها.
- أضيفت \`inventorySearchPage\` لتقديم \`totalMatches\` ومؤشر \`nextOffset\`، إلى جانب \`inventorySearch\` القديمة للتوافق. البحث يقتصر على النسخة الحالية المعتمدة والمغلقة ويتأكد من عدم الاقتصاص الصامت؛ واجهة المستخدم تحتاج لاحقًا الاتصال بالعقد المُرقّم بدل الاعتماد على أول 50 نتيجة.
- أضيفت صفحات \`inventoryDiff\` مع \`detailsTotal\` و\`offset\` و\`nextOffset\`، والـ\`reviewReceipt\` ثابت ومحسوب على الفروق الكاملة حتى إن تجاوزت 500 بند. يجب دعم التنقل في كل صفحات الـDiff داخل واجهة Owner قبل الإطلاق؛ لا تُعتبر الموافقة مكتملة في UI قبل عرض مسار مراجعة الكل.
- إعادة تشغيل بوابة Legacy \`39824917180\` **PASS** في جميع وظائفها بما فيها اختبار محرر \`#v6Editor\` الذي فشل في تشغيل سابق. لا يُعتبر اختبارًا نهائيًا ضد عدم الاستقرار/Flakiness؛ نتائج تشغيل أحدث ملزمة عند إطلاق النسخة.
- ما زالت \`inv_lab\` غير موجودة في Supabase Staging بناءً على آخر قراءة مؤكدة، والـPrivate Bucket التجريبية موجودة؛ لم يحصل أي SQL Migration حي ولا قنوات إرسال Resend ولا Vercel Preview ولا APK/OTA.
- البوابة التالية تبقى **NOT READY** إلى أن يثبت Backup Restore شامل أو يُعتمد مسار Rollback مُراجع، ويكتمل عقد API الحقيقي مع Auth/RLS/Storage وتُختبر بيانات Excel صناعية واقعية الحجم وOwner review Pagination وPerformance وStaging. **لا تغيّر Production أو main تلقائيًا.**


### متابعة CP-06 / CP-07 — حماية الـAPI وفحص الضغط التركيبي (22 أكتوبر 2026)
- فرع ومجال العمل: \`feature/maintrack-047-integration-20261022\` فقط. لم يتم دمج \`main\` أو تغيير Production أو Supabase Staging، ولم يُنشأ Vercel Preview أو يُرسل بريد Resend أو يُوقّع APK.
- Supabase Staging **قراءة فقط**: تأكد وجود \`public.mt_sessions.token_hash,expires_at,token_version,user_id\` و\`public.mt_users.id,role,active,must_change,token_version\`؛ قيم enum: \`owner/engineer/technician\`. \`inv_lab\` **غير موجود** حتى هذه المراجعة؛ Bucket \`maintrack-inventory-archive-staging\` موجودة \`public=false\`.
- \`create-review-http-handler.mjs\` يربط Session verifier الفعلي بــOwner RBAC ثم Parser + PostgreSQL + PRIVATE Bucket من خلال HTTP handler مع CORS allowlist. موديول مستقل **غير منشور** ولا يستمع لأي عنوان ولا يأخذ role أو userId من العميل. اختبارات \`review-http-handler.test.mjs\` تراجع Session hash ورفض owner spoof/عدم وجود جلسة وسرية مخزن البيانات؛ **تتطلب CI PASS على آخر SHA**.
- أضيف اختبار ضغط مختبري \`search-load.synthetic.test.mjs\` بـ3920 صنف صناعي، و30 طلب بحث متكرر عربي/إنجليزي، ويقيس p95 داخل runner؛ هو **ليس** قياس زمن استجابة Supabase أو الإنترنت أو APK ولا يُثبت تحمل 30 مستخدمًا على الهاتف.
- قيد تشغيل حاسم اكتُشف من توثيق Vercel: الحد الأقصى لحجم body هو **4.5 MB** (https://vercel.com/docs/functions/limitations). إرسال ملف Excel بحجم 10MB بصيغة Base64 يتجاوز هذا الحد. تم تقليل الحد التجريبي مؤقتًا إلى **2 MiB خام / 4 MiB JSON** وإرجاع HTTP 413 بوضوح قبل الكتابة. هذا لا ينهي مسار الرفع الكبير؛ يلزم تصميم رفع مباشر خاص مُقيّد بصلاحية Owner أو Resumable/TUS مع جلسة موثقة وحدود حقيقية على bucket، ثم مراجعة الفرق ونشره بعد الموافقة، مع منع أي مسار تخزين عام.
- فحص Supabase Advisors للقراءة فقط: 23 تنبيه \`INFO: RLS Enabled No Policy\` على جداول MainTrack الحالية، و12 تنبيه \`INFO: Unused Index\`؛ لم نحذف Index أو نغيّر RLS تلقائيًا، لأن التطبيق يستخدم جلسات مخصصة وخدمة API server-only ويحتاج تقييم سياقي قبل أي تغيير في صلاحيات القاعدة.
- بوابة ما قبل الإصدار: **NOT READY** حتى تثبت جميع اختبارات GitHub للـSHA الأخير، واستعادة G1 الكاملة أو Rollback موثّق كافي، ومسار الرفع الكبير، وUI Owner review Pagination فعلي، وStaging Authenticated E2E، وPreview، وAndroid APK/OTA. الاعتماد النهائي من المالك مطلوب صراحة.

## نموذج إقفال كل نقطة
- Timestamp (Cairo):
- Source commit / PR:
- Tests (PASS/FAIL/BLOCKED):
- Evidence (CI/report/screenshot without secrets):
- Baseline regression: unchanged / observed issue:
- Decision: PASS / FAIL / BLOCKED:
- Owner review (when required):

**هذه الوثيقة تسجل خطة التنفيذ ولا تعني اعتمادًا تشغيليًا لأي نقطة لم تُختبر.**


### CP-07 continuation — pinned inventory search pagination (22 أكتوبر 2026)
- تمت مراجعة Backend في الفرع التجريبي فقط، وأضيفت حماية ضد خلط نتائج البحث من نسختين مخزون عند نشر Owner لنسخة جديدة أثناء تصفح صفحات النتائج.
- `PostgresInventoryStore.searchPage` يتحقق من نسخة `inv_lab.active` و`generation` قبل قراءة العناصر وبعدها؛ يرد `versionId` للعميل. كل صفحة لاحقة ترسل `versionId` السابق. عند الاختلاف يفشل برسالة `INVENTORY_VERSION_CHANGED_RESTART_SEARCH` ويستدعي HTTP 409 لإعادة البحث من الصفحة الأولى. لا تُخمن النتائج أو تُدمج بين نسختين.
- عدّلت وحدة الخدمة لتمرير رقم نسخة البحث الموثوقة، واختبارات `postgres-search` و`inventory-service` و`http-adapter` و`search-load.synthetic` لتغطية تغيير النسخة، ورفض مؤشرات الصفحات القديمة، واستمرار قياس 3920 صنفًا صناعيًا.
- إثبات القراءة فقط من Supabase-Staging في هذه الجولة: `inv_lab` غير موجودة؛ `mt_users` و`mt_sessions` موجودتان. كشف Vercel للفرع v0.4.7: لا Deployments. **لم يُجرَ أي SQL DDL/DML، ولا نشر API، ولا إرسال بريد، ولا توقيع APK أو OTA.**
- GitHub Actions المرجعية **39828313445 = PASS/3 jobs**، وLegacy Actions **39824917180 = PASS/4 jobs**؛ كلاهما قبل هذا التعديل الأخير. **CI للـHEAD الحالي: PENDING INDEPENDENT VERIFICATION**؛ لا إعلان PASS نهائي حتى فحص نتائج نفس الـSHA.
- الموانع قبل CP-08/CP-09: مسار رفع ملفات Excel الكبيرة مع JWT غير قياسي (MainTrack opaque sessions)، `inv_lab` ومراجعة Migration وBackup، UI كامل يعرض كل صفحات Diff قبل قبول Owner، Staging E2E وPerformance، Web Preview، اختبارات APK/OTA/rollback، ثم موافقة المالك. تبقى بوابة النشر **NO-GO**.

### CP-06 / CP-07 — Complete Owner diff review gate (22 أكتوبر 2026)
- أُضيف `ops/maintrack/inventory/backend/src/owner-review-pagination.mjs` كـpure portable module تجريبي لتجميع **كل** صفحات فروق Excel قبل إمكانية إظهار خيار التأكيد في واجهة Owner المستقبلية. لا تتضمن الوحدة تشغيل API أو اعتماد بيانات أو اتصالًا بخدمات.
- يتحقق من ثبات `reviewReceipt` و`baseVersionId` و`currentVersionId` و`detailsTotal` في كل صفحة، ورفض: الفجوات في الصفحات، `nextOffset` خاطئ، التكرار في الأكواد، التداخل أثناء الموافقة، ونسخ `isStale`.
- أُضيفت 6 اختبارات صناعية للوحدة في `owner-review-pagination.test.mjs` تشمل 1203 صنفًا موزعًا على 4 صفحات؛ تُنفّذ داخل CI المعزول، وتُسجّل ملفات الوحدة والاختبار في `attest-047-source.mjs` بدل تعطيل source lock التاريخي.
- النجاح المستهدف: `complete=true` يعني **اكتمل تنزيل الفروق فقط** ولا يعني أن Owner راجعها بصريًا أو وافق عليها؛ موافقة Owner البشرية و`confirmReviewed` و`reviewReceipt` ما زالت منفصلة. ربط UI الفعلي لم يُنفذ بعد.
- أُضيف في GitHub Actions اختبار سلبي لدور PostgreSQL غير موثوق للتأكد من رفض الوصول إلى `inv_lab.items` و`inv_lab.publish_version` في PostgreSQL مؤقت. **النتيجة على HEAD الحالي لم تُؤكد بعد**.
- تم فحص GitHub Compare مقابل أساس 0.4.6: 42 ملفًا تغيّر على فرع 0.4.7، ولا تغيير في `index.html` الجذر القديم أو `web/maintrack/source-lock.json` أو مجلد `android/`؛ المصدر v0.4.6 باقٍ كما هو. لا يُفسَّر ذلك على أنه إثبات نسخ APK/OTA.
- قرار المرحلة: **SOURCE PREPARED / ISOLATED CI VERIFICATION PENDING / RELEASE NO-GO**.


### CP-07 CLOSED / CP-08 Preflight — تحقق CI حقيقي وتجهيز جلسات PostgreSQL (22 أكتوبر 2026)
- تحقّق مباشر من GitHub Actions عن **نفس HEAD `c6f4d7afb340677b7b1d70c1af34addea0ea2393`**: isolated v0.4.7 workflow `39839369152` = **3/3 jobs PASS**؛ Legacy Staging-only QA workflow `39839369245` = **4/4 jobs PASS**. النتيجتان مسجلتان عن تنفيذ معزول بدون نشر.
- بعدها بدأ CP-08 Preflight: فحص MainTrack-Staging SQL للقراءة فقط أثبت `public.mt_users.id uuid` و`public.mt_sessions.user_id uuid`, `token_hash text`, `token_version integer`, `expires_at timestamptz`, `mt_role` ومنطق `active/must_change`. **لم تُقرأ قيم جلسات أو حسابات حقيقية**.
- أضيف ملف `ops/maintrack/inventory/test_sessions_disposable.sql` لاختبار سيناريوهات هوية MainTrack على PostgreSQL مؤقت: Owner/Engineer/Technician، توقف الحساب، انتهاء الجلسة، تغير token_version، اشتراط تغيير كلمة المرور، وإلغاء جلسة المالك بمجرد زيادة إصدار التوكن. المعاملة تنتهي بـ`ROLLBACK` ولا تتصل بـSupabase.
- رُبط الاختبار في GitHub Actions داخل `qa-047-inventory-sql` وأضيف إلى مصدر بصمات الأمان المستقل `attest-047-source.mjs`. نتائج **آخر HEAD بعد هذه الإضافة تحتاج CI PASS خاصًا بها**؛ لا ننقل نجاح commit سابق إلى الجديد.
- G1 مؤكد سابقًا: نسخة age encrypted / checksum والتحقق المحدود للـRestore نجح، لكن `FULL_BACKUP_VERIFIED=false`, `FULL_APP_RESTORE_VERIFIED=false`. لذلك لا يمكن اعتماد Migration على Staging أو وصف النظام قابلًا للاسترجاع الكامل؛ بيانات التشغيل لا تُلمس دون استكمال الإثبات واعتماد Owner المنفصل.
- وضع الإصدار: **CP-07 PASS at c6f4d7a; CP-08 PREPARATION ONLY; STAGING MIGRATION NO-GO; Web/APK/OTA NOT RELEASED**.


### CP-08A — Sidebar mobile / role QA closure (22 أكتوبر 2026)
- مصدر فرع المراجعة: \`feature/maintrack-047-integration-20261022\`؛ آخر commit مُختبر: \`d4d66f6402971275ca6b7676856251719dedac66\`.
- GitHub Actions isolated QA run \`39847365392\`: **PASS 3/3 jobs** على نفس SHA؛ وStaging-only/Legacy QA run \`39847366341\`: **PASS 4/4 jobs** على نفس SHA. الروابط:
  - https://github.com/m-as23/ICC-Reports/actions/runs/39847365392
  - https://github.com/m-as23/ICC-Reports/actions/runs/39847366341
- أضيف \`ops/maintrack/tests/test_047_menu_roles.browser.mjs\` إلى job الـChromium الموجودة؛ الاختبار لا يسجّل دخولًا، ولا يحمل JavaScript التطبيق الشبكي، ويستخدم HTML/CSS وترتيب عناصر القائمة الفعلي من المصدر المقترح. يتحقق من إزالة صف الإجازات المستقل الحالي (موجود داخل «حسابي»)، إخفاء عناصر Owner-only عن Engineer/Technician، بقاء «قطع الغيار» أخيرًا، فتح/إغلاق القائمة، التنقل إلى المخزن، غياب تجاوز عرض الشاشة في 360/390/412/600/1280px.
- السجلات تؤكد **15 PASS** لوضع (Owner/Engineer/Technician × 5 viewports)، بالإضافة إلى MT-01 preview وMT-02 حفظ البلاغ من دون تداخل. لا يُستدل من الاختبار على جودة وصول رابط Vercel المحمي لكل جهاز، أو صحة جلسات المستخدمين الفعلية؛ اختبار Browser مع fixture صناعية فقط.
- صور الأدلة في GitHub Actions artifact \`MainTrack-047-MT02-Mobile-Screenshots\` (اسم الـArtifact تاريخي ويضم صور MT-07 الجديدة؛ حفظ لمدة 5 أيام). \`MainTrack-047-Source-Attestation\` يحتوي بصمات مصدر المرشح بعد الاختبارات.
- معاينة Vercel المصححة للعرض والتعليق فقط: https://maintrack-navigation-pilot-review-jncbk6mln.vercel.app/ ؛ مشروع \`maintrack-navigation-pilot-review\` = READY، وهدف النشر Preview وليس Production؛ التطبيق الحقيقي/Backend غير مشغلين داخل هذه المعاينة. حماية Vercel Authentication قد تتطلب الدخول بحساب Owner.
- قاعدة Staging \`inv_lab\` لم يتم إنشاؤها، ونشر API مخزن/Excel غير مفعل، ولا يوجد إثبات Backend authenticated E2E أو كفاءة تحميل 20–30 مستخدمًا على بيانات واقعية. لم يُوقّع APK ولم يُحدّث OTA ولم يحدث إنتاج.
- خطوة CP-08A: **PASS ISOLATED NAVIGATION QA**. خطوة CP-08B (Full restore/backups + Staging integration + live review) **BLOCKED**, وCP-09 **NO-GO**.


### CP-08B preparation — actual inventory dump/restore gate (22 أكتوبر 2026)
- تمت مراجعة سجل G1 الحالي (نسخة 20): تشغيل Web/API المحلي واستمرار البيانات نجحا بإقرار المالك؛ إعادة بناء وتوقيع وإعادة تثبيت نفس APK 406 نجحت؛ معمل OTA المنفصل أغلق PASS بما فيه إعادة الفتح. لا نعيد هذه الاختبارات، ولا ننسب نجاح المعمل إلى OTA التطبيق الأصلي.
- أضيف اختبار `ops/maintrack/inventory/test_dump_restore_disposable.sh` إلى خدمة PostgreSQL المؤقتة في CI فقط. يرفض التشغيل خارج GitHub CI، ويربط أوامره مباشرة بحاوية الخدمة postgres:16 وبقاعدتين مسماتين ثابتتين، بلا اتصال إلى Supabase.
- يعيد استعمال بيانات اختبار V1/V2/V3/النسخة المتقادمة/الرجوع الصناعية بعد الاحتفاظ بها داخل قاعدة CI؛ ثم ينفذ pg_dump custom واستعادة ذرية عبر pg_restore إلى قاعدة جديدة مع إبقاء ACLs. يقارن كل سجلات versions/items/active/audit، ويتحقق من الأرشيف وgeneration وصلاحية القيود ومنع تعديل الأصناف المغلقة وتسلسل الهوية ومنع صلاحيات الدور غير الموثوق. حذف صنف صناعي متعمد يجب أن يغيّر المقارنة.
- فحص Bash syntax وJavaScript syntax محليًا PASS، وحاجز التشغيل خارج CI رفض التنفيذ كما هو متوقع. مراجعة مستقلة للمصدر لم تجد مانعًا؛ **اختبار PostgreSQL الفعلي على هذا التعديل PENDING حتى ظهور نتيجة CI لنفس SHA**.
- هذا يجهز إثبات استعادة PostgreSQL الخاص بالمخزن فقط؛ لا ينسخ ملفات Bucket أو إعدادات Edge أو أسرارها أو خدمات Supabase كاملة. `FULL_BACKUP_VERIFIED=false` و`FULL_APP_RESTORE_VERIFIED=false` و`ORIGINAL_MAINTRACK_OTA_VERIFIED=false` باقية.
- الحالة: CP-08B PREPARATION IN PROGRESS؛ لم ينفذ Migration أو نشر API/Web/APK/OTA، ولا تغيير main/Production.


### CP-08C — Owner requested 047 APK + identical Web Preview (22 أكتوبر 2026)
- تصحيح أولوية المالك: الهدف الحالي نسخة APK قابلة للتجربة وويب من نفس المصدر. لا نعيد G1 ولا نربط تجهيز المعاينة بإغلاق شهادة الاستعادة الكاملة؛ النشر التشغيلي والدمج النهائي يظلان منفصلين.
- آخر مصدر قبل التغليف `ac714955365ab8f942d1011e1b1f1fb8d53e12e9`: isolated QA `39848983267` PASS 3/3 وLegacy `39848983134` PASS 4/4؛ اختبار pg_dump/restore للمخزن الصناعي نجح، ولا يثبت Full App Restore.
- أضيفت سياسة بصمات مستقلة `owner-047-preview-source.json` لملفات الويب 19؛ لا تعديل للقفل التاريخي 046 أو بصماته. `prepare-047-owner-preview.mjs` يولد الويب والـNative من نفس المصدر وAPI QA الحالية، مع 3 جسور native أصلية للجلسة والعمل المحلي؛ فحص bytes وحماية العبث PASS محليًا.
- الهوية المستهدفة `com.icc.maintrack` / `0.4.7` / code407 ونفس SHA256 لشهادة المالك. لا توقيع تجريبي بديل فوق تطبيق المالك، ولا حذف بيانات أو uninstall. workflow منفصل يبني unsigned أولًا دون أسرار، ثم توقيع داخل البيئة المحمية بشرط نجاح CI لنفس SHA. تسليم Artifact فقط؛ لا OTA ولا Production ولا employee rollout.
- اختبار full native unit الحالي أظهر فشلًا واحدًا في اختبار `Stage22 source changes exactly the three approved UI resources` لأن بصماته مخصصة 046. لم نغيرها أو نخفي الفشل: الحزمة الحالية تفحص 047 بالسياسة الجديدة وتختبر بقية native suite؛ المصدر 046 بكل اختبارات 109 يبقى في Legacy gate. اختبار `prepare-native-405-qa` القديم كذلك يرفض مصدر047 عمدًا؛ إعداد047 يستخدم pin مستقلًا لا يستبدل القديم.
- حدود المعاينة: شاشة المخزن موجودة لكن البحث ورفع Excel الحقيقي غير مفعّلين؛ تعديلات mail worker غير منشورة. يجب إبلاغ المالك بهذه الحدود عند التسليم. Web/APK authenticated device acceptance ما زالت NOT_RUN.
- Build407/Signed407/WebPreview: PENDING؛ تُعتمد النتيجة من مخرجات نفس SHA لا من اسم Artifact.


### CP-08C DELIVERY — installable isolated 047 Preview (22 أكتوبر 2026)
- تم بناء APK407 الأصلي من `e553e9922105f744ea72dcf8271e7378eb801979` بنجاح في run39851727212. توقيعه بالمفتاح الأصلي لم يبدأ: GitHub رفض `feature/maintrack-047-integration-20261022` ضمن حماية `maintrack-android-release`. لا تعديل للحماية أو قراءة أسرار المالك. الحزمة الأصلية unsigned وليست قابلة للتثبيت.
- لتلبية طلب APK للتجربة، أُخرج تطبيق مستقل `com.icc.maintrack.preview047` بعنوان `MainTrack 0.4.7 Preview`، versionName0.4.7/code407، بجانب الأصل وليس ترقية فوقه. لا يقرأ الجلسة/البيانات المحلية للتطبيق الأصلي، ويتطلب تسجيل دخول مستقلًا؛ يستعمل API QA الحالية بعد المصادقة.
- المصدر `bf0c21ce2a5eb98df1a6b71c0679e6ffd96c000a`، run39852839469 **SUCCESS**. Gradle BUILD SUCCESSFUL؛107 native regression PASS، واختبار تطابق047 ومنع provenance مزوّر وفحوص syntax وidentity PASS. isolated QA39852839262=3/3 PASS؛Legacy39852839277=4/4 PASS.
- الملف النهائي `MainTrack-0.4.7-407-ISOLATED-PREVIEW.apk` حجمه5078676bytes؛SHA256 `2ffd28985a741b9b0b613580df7c02b46c2999843483310396d599c0cb409618`. شهادة QA مؤقتة مستقلة `ec0006f29a622563362f2fbc8382f2243546fbaff68d01b827ee8b9ab57fd53e`؛توقيعv2/v3=PASS،release غيرdebuggable،ومعرّف التطبيق المنفصل مثبت بأداةaapt. المفتاح المؤقت لا يُرفع كـArtifact،ولا يخص توقيعMainTrack الأصلي.
- تحقق محلي من بصمة/CRC ZIP،مطابقةSHA للـAPK معprovenance،ومطابقة **22/22** ملف واجهة/جسورnative داخلAPK مع بناء407 الأصلي PASS. تجربة تثبيت الهاتف/تسجيل الدخول الفعلي للنسخة المستقلة NOT_RUN؛ مطلوب قبول المالك بعد التنزيل.
- Web Preview READY،deployment `dpl_3a44zoJwHj4R5MRBVTb6sKmWVmc8`،target=null Preview،بدونalias إنتاج: https://maintrack-final-security-b0ib33obd-mohamedashrefsrag-5918.vercel.app/ . نفس19ملف تطبيق مشتركة؛JS الخدمةالمقدمة مطابق بايتًا،وHTML مطابق مع إضافة منصةVercel لسكريبتfeedback في نهايته. لا استبدال للويب المستقر.
- OPTIONS من `https://localhost`=200 معCORS صحيح؛OPTIONS من عنوانWeb Preview الجديد=403 `ORIGIN_FORBIDDEN`. لذا المعاينة منشورة،لكن دخولالويب متوقف حتى اعتمادOrigin الجديد. لا ننسب لها authenticated E2E PASS.
- محاولة إعادة نشر وظيفةQA الحالية بإضافةOrigin واحد فقط رُفضت بواسطةautomatic approval review لأن طلبAPK/Web preview لم يعده تصريحًا لإعادة نشرBackend نشطة. **لم يُنفذ النشر**. الإجراء المراجع المطلوب اعتماده: إضافة `https://maintrack-final-security-b0ib33obd-mohamedashrefsrag-5918.vercel.app` فقط إلى `MT_ALLOWED_ORIGINS` في `maintrack-unified-four-qa`،مع بقاءجميعbytes والمنطق وverify_jwt=false كماهي. لا تعديلDB أوRLS أوصلاحيات أوإرسال بريد.
- حدودAPK/Web المعروفة: شاشةالمخزن للمعاينة؛البحث ورفعExcel غيرمفعّلين. Mail worker047 غيرمنشور. Original-key407 upgrade وOTA والنشرالتشغيلي لم تُعتمد. الخطوةالتالية هي **تجربةالمالك للـAPK + اعتمادCORS المحدد لتشغيلWeb**،وليست إعادةاختباراتG1.

### CP-08E — functional inventory + agreed mail update (22 October 2026)
- Owner clarified server failure is Web; reported APK multi-user/report-create/edit works. Asked to activate inventory and agreed mail, which supersedes earlier placeholder-only scope.
- Mail worker v8 deployed and read back: sender display MainTrack Notifications, actual creator employee name, AM/PM report start, total duration, agreed Arabic subject. Queue/auth/recipient/sender address unchanged. Two mocked payload tests PASS; actual delivered new-report email NOT_VERIFIED, no manual mail sent.
- Private inv_lab migration applied; verified 4 tables, no PUBLIC schema usage, zero inventory versions/current=null. Real stock must be uploaded and approved by Owner; no synthetic live stock imported.
- New maintrack-inventory-047-qa deployed v2, with own MainTrack opaque-session verification, private XLSX archive, exhaustive pinned search pages, complete diff receipt and separate human approval. Live health200, native preflight204, invalid bearer401, new Web inventory preflight204. Authenticated live upload/search/publish NOT_RUN (no Owner credentials available).
- Functional controller now in shared Web/APK assets: search code/quantity/full description/location, more results, Owner Excel upload, all diff pages, explicit review/large absence approval, archive history. Returning to inventory clears prior results to prevent stale quantities under a newer version heading.
- Source 8d02dcc094b64656d3febc54ea3f2b77730c5ae1 QA run39858819869: static/mail/client, mobile browser (Owner and technician functional fixture flows), disposable PostgreSQL all PASS. Local backend 60/60 and mail/client4/4 PASS. No real stock/account included in fixture tests.
- Signed separate Preview 2 APK run39858819881 SUCCESS, artifact12461032730. Package com.icc.maintrack.preview047r2; version0.4.7/code407. MainTrack-0.4.7-407-INVENTORY-PREVIEW.apk size5082848, SHA256 abaa84f0ad71ecab8c8396e0f5c4a473a7b0cde1a7ba0c59650e708a5d53f066. Ephemeral certificate3d2c1ce7c63def03c5c56507e159d0336ec28e7cf4ade9764d55d462505fc058, v2/v3 verified. All23 prepared native app assets match APK. Saved deliverable. Device install NOT_RUN; installs alongside previous preview and requires login. Original app key upgrade still blocked by environment; no bypass attempted.
- Matching Web Preview READY: https://maintrack-final-security-km1nq1386-mohamedashrefsrag-5918.vercel.app/ deployment dpl_G9d1Hvwqn27Y9xDfuYQhuWZrcpz4, target=null; shared20 assets. Served inventory JS byte-equal. Inventory Edge explicitly permits this origin.
- Web login remains BLOCKED: maintrack-unified-four-qa v15 preflight for new origin returns403 ORIGIN_FORBIDDEN. Prior automatic approval rejection still respected. Exact prepared pending change: add only https://maintrack-final-security-km1nq1386-mohamedashrefsrag-5918.vercel.app to MT_ALLOWED_ORIGINS, all other source bytes/config/auth unchanged. NOT_DEPLOYED; explicit Owner approval requested at handoff.
- No main/Production promotion, no original app signing, no OTA. Next acceptance: Owner approves first actual inventory XLSX and verifies next report email; Web requires exact Origin approval above.

### CP-08F — Web exact Origin explicitly approved and deployed
- Owner explicitly approved the pending change. maintrack-unified-four-qa v16 deployed with only the exact km1nq1386 Preview origin added; all other source bytes and verify_jwt unchanged, verified by fetching deployed files.
- Live verification: Web OPTIONS200 with exact CORS; native https://localhost OPTIONS200; unapproved.example OPTIONS403 without CORS; Web bootstrap without a session401 AUTH with exact CORS. This resolves the confirmed browser Origin rejection, without bypassing login authorization.
- Real Owner login/report/inventory flows remain user acceptance checks; no credentials assumed and no report/email created by these probes. Use the existing matching Web and Preview2 APK links from CP-08E. Previous Origin approval blocker is CLOSED.

### CP-08G — Jul 2026 inventory XLSX import compatibility fix (23 October 2026 Cairo)
- Reproduced actual uploaded XLSX (SHA256 c35d99c4f6ee3a8e61235691bfe8ffe43fde61e00ef0b830ee75048788a2575d, 721287 bytes) without changing it: externalLinks XML rejected by preflight, followed by optional lookup formula failures. ExcelJS cell.value also omits cached zero; cell.result preserves it.
- Parser now ignores inert external-link package metadata (never resolves/fetches external files); consumes stored cell results using cell.result; leaves optional location/card lookup errors blank. Required codes/description input and authoritative quantities remain strict. ZIP limits/path checks/VBA/embedding rejection remain. No formula recalculation or guessed balances.
- Actual file parses3920 unique codes. Independent raw ZIP/XML reconciliation PASS for all3705 authoritative balance quantities and complete code union. Remaining215 codes exist only in location sheet and retain quantity=null;189 have unavailable description. No actual stock written/imported/approved by these local tests.
- Tests added first and observed failing before fix; full backend66/66 PASS, independent reviewer parser7/7 PASS. Private workbook and parsed inventory are NOT committed to repository.
- Inventory Edge v3 deployed and fetched source matches the rebuilt reviewed bundle. Existing matching Web and Preview2 APK use the same API and need no client rebuild for this fix. Owner still uploads/reviews/approves the file through their session; authenticated live import acceptance remains pending.

### CP-08H — approved inventory-only V9 reference design (23 October 2026 Cairo)
- Owner supplied current-design.html and explicitly selected inventory-only scope. Existing sidebar/order, reports, account and approvals remain unchanged. No embedded reference stock, demo-only local approval logic, feedback or trial banners were imported.
- Inventory now uses reference palette/outlined SVG icons, product cards with source description/code/quantity/location, copy code, a modal detail sheet, explicit load-more12, full-result type/location/stock filters and sorting. Mobile filters use native modal bottom sheet with Escape/focus handling. Native select/file picker intentionally preserve platform behavior.
- Search filtering operates only after collecting the COMPLETE version-pinned API result set, detects incomplete/changed pages and session supersession, and labels the exact approved snapshot displayed. Unknown/zero values remain distinct. Review receipt/Owner confirmation and existing authorization remain unchanged.
- Browser fixture run39901959381 on9aa6461 passed Owner/Technician at390/1280 plus existing mobile/menu checks; screenshots visually reviewed. Independent review found mobile sorting hidden and heading snapshot mismatch; corrected in final source6626f61255e810ae2a4afbe403f13524e8713d16, presentation/client4/4 plus static/parity checks PASS. Final browser runner39902164196 subsequently completed SUCCESS, including Owner/Technician at390/1280 and existing mobile/menu regressions. Whole-repo premium audit reports legacy out-of-scope forms/ownership issues; no broad compliance claim or unrelated redesign.
- Final isolated APK build39902164288 SUCCESS; artifact12478849828. MainTrack-0.4.7-407-INVENTORY-DESIGN-PREVIEW.apk, packagecom.icc.maintrack.preview047r3, labelMainTrack0.4.7Preview3, bytes5095136, SHA2565f1ab2353d2f123a635410c2ed2ff6e4d37917f1b2f7aa5fa5fceca126ce4efe. Ephemeral certificateb3b32e83c8d7db6f5081a0b2cd844c1869a509d16c3140396c9a45b86eefe7a3; v2/v3 verified; all23 native application assets byte-match prepared source. Saved deliverable libfile_b7f8292270248191a7c92a4c0264a4b3. Device install NOT_RUN; installs alongside previous previews. Original-key environment restriction remains; no bypass or OTA.
- Matching Web deploymentdpl_3f9Nj3gcJvb4XwXxbs2wWetKPbob READY Preview target=null, no production alias: https://maintrack-final-security-6oskca75z-mohamedashrefsrag-5918.vercel.app/ . Served inventory JS/CSS byte-match prepared files. Exact new origin added only to QA allowlists (MainTrack mainQAv18, inventoryv5) under Owner's standing explicit access/approval. Web preflight200/204 and unauthenticated401 verified for both services.
- Next user acceptance: actual login, inventory import/approved stock/card details on Web and Oppo APK. Real delivered email and authenticated live inventory acceptance are not inferred from fixture tests.

- Final read-only acceptance evidence: live inventory contains a current sealed approved snapshot of3920 items. Earlier pending attempts remain pending and are not searched. No stock was published by the assistant during this design task.

### 2026-10-23 — Exact supplied HTML inventory page delivered
- Replaced rejected reconstructed inventory UI with the supplied HTML's isolated document, original 27,123-byte CSS, SVG icons, V9 search/measurement rules, adaptive facets, result cards and drawers. Reference SHA-256: `3aaad612e29bbec9e24879a429a0681e5a6afd8e096e208a9d01899f8b08a288`. Embedded private stock and local IndexedDB approval were removed from public assets; authenticated approved snapshot and existing Owner review/publish/restore remain authoritative.
- APK build source `f30d99f31da481317e67e0bc3be312a6aba5010b`, run `39919080316` SUCCESS, artifact `12485429914`. Signed isolated package `com.icc.maintrack.preview047r4`, version `0.4.7` / `407`, 5,111,863 bytes. SHA-256 `51fd77c0510d5c034a7baaf697831e0875b181d987b3c40895f6a2bdcd2fb571`; certificate `e4434078408a6ac88492d0a0cc5e590387723aa98914942ca06cef6cf49b5036`, v2/v3 verified. All 27 packaged native assets match the prepared candidate exactly. User file: `MainTrack-0.4.7-EXACT-HTML.apk`.
- Matching Web preview READY: `https://maintrack-final-security-jb82mdyun-mohamedashrefsrag-5918.vercel.app/`, deployment `dpl_CHr3FgA3E2TqQah4cycfnKDpC1Uj`, no Production alias. Served reference CSS/engine/integration bytes match prepared assets; Vercel appends its own feedback script after the HTML. The reference HTML/CSS/engine/integration files are byte-identical between Web/APK; native session/bridge additions are validated separately.
- Inventory Edge v7 adds only authenticated read-only snapshot plus exact new Preview origin; MainTrack QA v19 changes only the exact origin allowlist. Inventory preflight 204, unauthenticated read 401 and unapproved-origin 403 verified. MainTrack `/api` unauthenticated session 401 verified. Actual stock was not changed by this UI work.
- QA source `1ab2661673d1e0007a5d5e0460625f0fe4f0bf8e`, run `39921351892` SUCCESS: all seven Chromium tests passed, including Owner/Technician at 390/1280, original result DOM/facets, card visual comparison, search/more/filter/detail, complete 101-row review pagination, explicit approval and stale-detail closure on snapshot change. Mobile menu/form regression and disposable PostgreSQL checks also passed. Local inventory/parser/client suite: 73/73.
- Compared the supplied source's engine and the integrated engine against the uploaded 3,920-item workbook: same M700 result count/facets. Visual comparison excludes the floating feedback overlay and aligns card rasterization at integer origin; it does not claim every whole-page pixel on a physical device is identical.
- Remains an isolated installable Owner test APK. Original signing-key environment restrictions remain in force. No OTA, employee rollout, manual email or physical-device installation test performed.

## 24 أكتوبر 2026 — Team Leave & Overtime Ledger (فرع مستقل)

مرجع الحالة الجديدة هو هذا القسم؛ الأقسام السابقة سجل تاريخي لا يُعاد تفسير PENDING القديم على أنه الحالة الحالية.

| CP للطلب الجديد | الحالة | الدليل والنطاق |
|---|---|---|
| CP-01 مراجعة المشروع | PASS | HEAD047=ba5102b؛ CI39993561020 و39993561050 ناجحان؛ API Staging v21؛ جداول الأرصدة/الحركات الحالية صالحة لإعادة الاستخدام. فرع مستقل feature/maintrack-team-balances-from-047-20261024 من HEAD نفسه. |
| CP-02 استقرار047 | PASS ضمن أدلة المصدر وCI، مع BLOCKED مستقل | المخزن6/3920، إجمالي6نسخ؛ لم تتغير. AI ready=false/failures4/PROVIDER_UNAVAILABLE. لم يُفعّل مزود أو مفتاح. التوقيع الأصلي/OTA/استعادة التطبيق الكاملة والبريد المستلم الفعلي تظل BLOCKED/NOT VERIFIED. |
| CP-03 أرصدة الفريق | PASS للكود المعزول؛ BLOCKED للربط الحي | مصدر SQL مركزي بنفس حساب accountSummary، Owner API للقراءة فقط، تبويبا admin مع الحفاظ على Accounts. لا Migration؛ مرشح API لم ينشر ويتطلب موافقة محددة على Staging. |
| CP-04 اختبارات | PASS للصناعي/المتصفح؛ اختبار الجهاز NOT STARTED | PostgreSQL حقيقية داخلWASM، handler كامل+جلساتopaque، مقارنةملخص الحساب الحالي، صلاحيات وحالات/نصف يوم/بدل/مالي/تسويات/تواريخ/صفحات. UI360/390/412/600/1280 وحالات الاستجابة القديمة، ومضيف التطبيق الكامل. المخرجات والأوامر في README الميزة وCI الفرع. |
| CP-05 المعاينة | IN PROGRESS | بناء Web Preview صناعي واضح منفصل وAPK بحزمة QA جديدة. المعاينة الموصولة ببيانات فعلية تنتظر موافقة API وOrigin المحدد إن لزم؛ ليست PASS قبل تنفيذها. |
| النشر الرسمي/main/Production/Original OTA | BLOCKED | لا تصريح في هذا الطلب. |

نقطة سياسة معلقة: لا يوجد رصيد سنوي تاريخي مستقل في DB. نعرض الأرصدة الحالية المطابقة لحسابي ونصفي السجلات بالسنة مع تنبيه صريح؛ لم نخترع ترحيلًا أو استحقاق28 للجميع. اعتماد أرصدة افتتاحية لكل سنة عمل منفصل.

### Team Ledger — إقفال مرحلة المراجعة
- CP-05: PASS للمعاينة الصناعية المستقلة وAPK المنفصلة/تطابق الأصول؛ BLOCKED للربط الحي وتثبيت الجهاز. Preview URL وCI والتوقيع والحدود في ops/maintrack/team-ledger/README_AR.md.
- CI النهائي e9a2d463: Isolated40065598545=3/3PASS،Regression40065598508=4/4PASS. APK40065440220 من c20c350 ناجح؛ أصول التطبيق لم تتغير في تصحيح تصنيف CI اللاحق.
- خدمة Staging الأصلية ما زالت v21 وملفاتها الأصلية كما هي؛ فرع047 لم يدمج إليه هذا العمل. النشر الرسمي وAPI/Origin الحي تتطلب الموافقة المحددة، ولا تدخل فيPASS الحالي.
- مرشح Web حقيقي منفصل جاهز عند ntkx35xm8 (الرابط الكامل وتغييرOriginالمحدد فيREADME). بوابة الموافقة: نشرمرشحSharedAPIمنv21 + Originواحد، وإضافةنفسOriginلـInventoryv20فقط. لا تنفيذ حي قبل موافقةالمالك؛ لا تغييراتعلىالمصادقةأوبياناتالموظفينأوالمخزون.

### Team Ledger — اعتماد المالك ونشر الربط على Staging فقط

| البوابة | الحالة الحالية | الدليل |
|---|---|---|
| موافقة خدمة Staging والـOrigin المحدد | PASS | طلب المالك استكمال الخطوات بعد الاعتماد. أُعيد فحص الإصدارات والبصمات قبل النشر. |
| ربط الأرصدة بالمصدر المركزي | PASS للنشر والتحقق | Shared QA v21→v22، والملفات مطابقة للمرشح؛ Inventory v20→v21 بإضافة Origin واحد فقط. لا Migration أو تغيير بيانات. |
| الاتصال والرفض الأمني | PASS ضمن نطاق الاختبار | Origins المصرح بها200/204، وغير المعتمد403، وطلبات الأرصدة والمخزن بلا جلسة401، وhealth200. |
| مطابقة الأرصدة الحالية | PASS كقراءة SQL حية | إسقاطا Account/Owner متطابقان للـ15 موظفًا على Staging، دون كتابة أو عرض بيانات شخصية. |
| Web/APK مع الربط الجديد | READY | رابط ntkx35xm8 الفعلي وAPK preview047team1 السابقة بنفس الأصول. لم يتغير Alias أو رابط QA القديم. |
| قبول Owner على الجهاز | NOT STARTED | لم تُفترض جلسة أو كلمة مرور؛ يلزم اختبار المالك على الموبايل/الويب. |
| النشر الرسمي/main/Production/Original OTA | BLOCKED | خارج الاعتماد الحالي. |
