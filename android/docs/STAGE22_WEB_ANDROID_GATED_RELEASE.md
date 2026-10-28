# MainTrack Stage22 — gated Web + Android rollout

Status: **release candidate only, NOT publicly published**. Scope: approved Owner unified requests inbox, filters on resolved history only, active approval notices and archived decisions, overtime compensation choice, pilot badge removal, and native Keystore session persistence.

## Reviewed release inputs
- Reviewed source: `b8aaffb4e13269bccd18c0b6736a5fd17192e57b` on `fix/maintrack-pilot-session-candidate-20261018`.
- Web + Android QA: GitHub Actions [39104596650](https://github.com/m-as23/ICC-Reports/actions/runs/39104596650) PASS (34 Node checks, 6 mobile browser checks, Android Debug build, byte-matched Web+Android UI).
- Android simulator test: [39091263979](https://github.com/m-as23/ICC-Reports/actions/runs/39091263979) PASS for Keystore session restoration and explicit logout (synthetic credentials only).
- Latest Vercel Preview: `dpl_CsBZUjwnMDdW5ngVfNuTXmvSt8cZ` at `https://maintrack-final-security-h9d7opg2w-mohamedashrefsrag-5918.vercel.app`, Vercel READY, target Preview and project `maintrack-final-security-qa`; it is NOT the official web domain.
- Existing device OTA LAB discovery on `android/stage14-ota-native-lab`: signed v0.4.3 on `updates/android/release.json`. Neither this pointer nor the existing web official site has been changed.

## Hard release gates (do not bypass)
1. **Identify the actual official Web host / project / deployment alias.** Only the separate `maintrack-final-security-qa` project is currently visible from the Vercel connection. Do not promote the QA preview as production or assume a QA domain is official.
2. **Promote compatible server code safely.** Current deployed stable Supabase Edge `maintrack-stage9-security-api` v10 lacks six endpoints used by the new UI: `accountSummary`, `overtimeMine`, `overtimeRequest`, `overtimeDecision`, `overtimeInbox`, `overtimeSummary`. QA `maintrack-unified-four-qa` v13 includes all 26 pre-existing cases plus six; this is not sufficient proof of runtime compatibility. Run authenticated regression with owner, engineer and technician before changing the stable Edge function, with the current v10 source kept ready for rollback. Preserve current `verify_jwt=false` because legacy custom auth validates inside the function; never paste secrets into chat or artifacts.
3. **Android installed-app signing proof:** The owner-installed `com.icc.maintrack` APK `versionName 0.4.1` has an unknown certificate fingerprint. Existing QA `com.icc.maintrack.stage22qa` v0.4.6 uses an independently signed debug certificate and cannot upgrade installed production app. For in-place update require exact package ID, the same certificate and strictly higher native `versionCode`. Do not uninstall or overwrite data; no key substitution.
4. **Native session plugin** is not OTA-deliverable. An OTA can change UI only; if persistent native Keystore session is required, ship a separately signed native APK that passes in-place upgrade on the owner's physical installation first.
5. **OTA signing:** A subsequent UI-only bundle must be byte-checked against this release candidate, signed with the owner-pinned Ed25519 OTA key, have a version higher than 0.4.3, preserve the existing trusted manifest URL and reject changed app ID or unsent report queue. Publish to LAB before any broader rollout and test actual device acceptance.
6. **Web versioning:** On the confirmed stable origin publish immutable new release assets and no-store version pointer, preserving old bundles so currently open tabs, bookmarked reports and rollback remain functional. Only promote after API compatibility and device safety. Check navigation, CSP and mobile.
7. **Acceptance:** Auth and RBAC, reports create/save, CMMS, Owner leave and overtime approve/reject, after-decision move to archive, notification count and historical access, employee balance, session after process death/reboot, offline queued reports, correct web version discovery and signed Android update. Fail closed on any failure.
8. Never clear or migrate existing user data in the release. No Google Sheets reconciliation or Production/main rewrite as a workaround.

## Deploy/rollback order
- Keep existing stable Edge v10 source, existing Vercel deployment, and signed Android manifest 0.4.3 for rollback.
- Verify stable backend upgrade on live role-based test accounts with authorizations and audit events.
- Deploy new Web immutable files to **verified official project**, check, then update stable pointer.
- Deliver signed Android APK upgrade only if certificate parity is proven. Otherwise offer a gated, signed UI-only OTA with honest limitation about old native session behavior, not an unverified replacement APK.
- Monitor login, Owner approvals and notifications, and real report saves; rollback pointers and Edge code on error.

This document records the go/no-go checks; its presence is not an authorization bypass. Production release stays blocked until required evidence is present.
