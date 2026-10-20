# MainTrack — External Synthetic Backup, Android Device and 32-Action Web Cutover
**2026-10-20 · QA branch only · Release decision: NO-GO**

## Completed: external sanitized QA operational backup and recovery
The external artifact at `ops/maintrack/fixtures/isolated-qa-synthetic-export-20261020.json` was **read from the isolated `qa_full` schema**, scrubbed of password hashes, phone/preferred names, authentication and rate guard/session tables, and saved into this QA-only GitHub branch.

Using the **saved GitHub file** (not a second DB-to-DB copy), a separate `qa_offsite` schema was reconstructed from `ops/maintrack/qa-full-schema-only.sql`. Nineteen operational tables totaling 35 synthetic rows were imported transactionally. Missing secrets were replaced by fresh random password hashes; phone and preferred_name were set to harmless blank values. All 8 sequence counters were restored from the external artifact. User-trigger side effects were disabled only on the empty restore destination during import, then restored.

**Independent verification:** 19/19 source-versus-restored table hashes matched when the intentionally scrubbed user fields were omitted. Target catalog has 23 RLS-enabled tables, 3 functions, 0 sessions, 0 active users, no enabled outbound mail, and restored WO sequence equal to source. Original `qa_full`, `qa_restore`, employee Staging and Production remained untouched by this test.

**Limitations:** This is an external **synthetic operational data export**, not an encrypted complete Supabase backup or a disaster-recovery exercise after loss of an entire project. Authentication/session data, provider configuration, API secrets, object storage, migration history outside `qa_full`, and platform-level restoration were deliberately excluded. The full independent encrypted/offsite backup gate remains OPEN; do not mark it complete.

## Completed: real concurrency safety
The previous run verified 5 race-condition scenarios / 27 assertions on a separate `qa_restore` DB, with `QA_RACE_PASS`, zero residual sessions and disabled synthetic accounts. See `RECOVERY_CONCURRENCY_ROLLBACK_QA_20261020.md`.

## Prepared: APK and device read-only preflight
`ops/maintrack/scripts/owner-device-qa-preflight.py` examines a **locally supplied APK candidate**, using Android SDK `apksigner verify --print-certs` and `aapt dump badging`. It validates:
- exact application ID `com.icc.maintrack`,
- owner-verified existing signing SHA-256 `07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b`,
- future native versionCode **405 or newer**.

It can *optionally* use `adb` to **read** the installed package version on one authorized device. It never calls `adb install`, `pm clear`, factory reset, uninstall, APK publish, or Web/OTA release.

Commands to run later on a machine that actually has the owner-approved signed candidate and Android SDK build-tools:
```bash
python3 ops/maintrack/scripts/owner-device-qa-preflight.py --self-test
python3 ops/maintrack/scripts/owner-device-qa-preflight.py --apk /path/to/approved-candidate.apk --read-device
```

No candidate APK is assumed to exist; no current installed device version was inferred from repository history. The signed actual APK on the owner's physical handset, OTA activation, backup and data-preserving native update/rollback are **NOT TESTED**. In particular, Android APK rollback by downgrading native versionCode is different from rolling back an OTA Web bundle and may not be safe; never force reinstall or wipe app data as a substitute for a tested backup.

## Web 32-action compatibility and deployment blocker
- Verified source contract `ops/maintrack/production-api-contract.json`: **32** required operations; legacy source API has **26**, and isolated QA backend logic has **32**.
- Current canonical browser JS `web/maintrack/public/secure-assets/index-inline-1.js` still embeds the Stage9 **26-action** endpoint. This must **not** be deployed as a full Web/Android release.
- The version-pinned QA-only candidate already exists through `ops/maintrack/scripts/prepare-qa-api-client.mjs`, `prepare-complete-staging-web.mjs` and `prepare-native-405-qa.mjs`. Its one-literal rewrite points at the existing 32-action **employee Staging** QA backend and remains a **nondeployed test artifact**. The canonical Web source and current apps remain unmodified.
- For Production, first establish and verify a **separate Production** Supabase database and 32-action API, a protected endpoint/Origin/secret configuration, and exact Web+native code commit. A Staging or RBAC-QA URL is **not** an acceptable Production target.
- After explicit owner approval: build the immutable release-candidate Web and APK, inspect signing certificate and versionCode, run real owner-device update and OTA rollback preserving unsent local work, and approve a canary before rolling out.

## Quality gate evidence
- Existing GitHub Actions `maintrack-change-qa.yml` contains Node/Chromium/OTA/rollback simulations, a real isolated 32-action deny smoke, version/certificate floor and Web/API source parity gate; **none of these install an APK or publish Web/OTA**.
- Added `android/maintrack-app/tests/qa-offsite-recovery-and-release-gates.test.mjs` to the *existing* `npm test` glob; it imports the previously unexecuted five recovery/rollback assertions, verifies the external fixture has no secret fields and checks the Python certificate parser without touching a device. The exact GitHub Actions SHA must complete successfully before marking these added tests PASS.
- This document is QA evidence, **not authorization** to modify the production database, original employee Staging, the Android handset, `main`, or deploy Vercel/Web/APK/OTA.

**Final current decision: NO-GO for Production.**
