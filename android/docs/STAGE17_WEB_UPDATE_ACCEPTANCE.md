# Web update experiment — 2026-10-16

Scope: QA only, branch android/stage14-ota-native-lab. Production/main unchanged.

Stable QA origin: https://maintrack-update-pilot-mohamedashrefsrag-5918.vercel.app

- Baseline 6b13d73b4270e4bcb6e956ea57fb5df3be8e97a5 retains Pilot corner note.
- Candidate 76be9f10074676a26cab82980330eabdd678185c removes that note only in generated HTML.
- Deployment dpl_FtJgB45xwNUvyhXRvpZtTCUFAADm is READY and contains both release directories.
- Alias now targets candidate deployment. Root loads candidate; old release URL remains available for update testing.
- TinyFish run c07fb106-47a3-46be-92ef-8123e5ebfaab confirmed baseline: no initial message, manual check reports current, message disappears after six seconds, reload stays quiet.
- Run 3c85f8fe-f59e-436c-b637-6adacd2e5f72 detected candidate on old release but did NOT confirm navigation after Apply. Transition acceptance FAILED/incomplete.
- Diagnostic run ec456ea6-3b5d-406b-bfab-72677eac8786 could not read runtime guard flags or console. Its claim that login is mandatory is an inference, not confirmed by code; do not use it as root cause.
- Guard checks must remain enforced. Do not clear storage or bypass local-work checks to pass QA.
- Android generation includes the same visual patch, but no new signed OTA/APK has been distributed. Prior lab OTA private key was deliberately deleted; installed app pins its public key. A compatible signed replacement APK and maintained signing setup are needed before claiming future OTA delivery.

## Follow-up live browser acceptance — 2026-10-16 21:05 UTC

PASS: a fresh Chrome browser accessed the protected QA alias through a temporary
Vercel-authorized access link, then opened the baseline release above. No application
login, report edits, queue clearing, guard bypass, code changes, or redeployment
were needed for this check.

1. Baseline showed the Pilot note and no automatic update status.
2. A real click on Check displayed the available update and Apply button.
3. A real click on Apply showed the progress overlay, then navigated to the
   candidate release path above. The old URL visible during the progress overlay
   is an intermediate state, not a completed failure.
4. Candidate no longer contained `بلاغات تجريبية فقط` in the DOM.
5. Check on candidate displayed the current-version message; it subsequently
   became hidden with empty text.
6. Reload retained the candidate path with hidden, empty update status.

The previous TinyFish navigation failure was not reproduced. Its cause is still
unproven; do not attribute it to application login or a confirmed code defect.
This result verifies the anonymous browser transition only, not authenticated
session preservation, installed PWA behavior, or Android OTA delivery.

Remaining: installed PWA/device acceptance and the Android signing/replacement
APK requirement described above. Test on synthetic data only.
