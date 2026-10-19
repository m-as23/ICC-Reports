# MainTrack — Signed Native 0.4.5 (405) Owner QA Build

## Owner approval and scope
The Owner explicitly approved merging PR #10 and starting the next **signed native test APK** phase. This workflow is for one installable **Owner QA** APK only, not employee publication.

## Automated release gate (fails closed)
New workflow: `.github/workflows/maintrack-owner-qa-apk-045.yml`.

- Runs automatically **only after this specific workflow file is merged/changed on the protected ops branch**, and can be triggered manually later if available. No automatic build on unrelated app changes.
- Uses restricted `maintrack-android-release` environment, read-only GitHub token, pinned exact commit, and requires the named `MainTrack Staging-only QA — required combined result` to finish with success for that **same** commit.
- Confirms Owner Android `0.4.4 / versionCode 404` Environment variable matches 404. Fails on reused 404 or downgrade; next code must be **405** with versionName **0.4.5**.
- Preserves the installed `com.icc.maintrack` app ID and SHA256 certificate `07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b`.
- Assembles the exact reviewed `audit-output/native-405-qa/www` candidate (Staging 32-action API, native session bridge and offline work guard). Does **not** use legacy `snapshot.mjs` (it deliberately targets the old 26-action source).
- Verifies every staged JS and HTML asset hash and Capacitor's copied Android assets, registered Android Keystore session plugin, security flags and Gradle identity. Only then compiles with Gradle.
- Uses the **existing** Android keystore to sign. Checks the private key and signer certificate without logging it, verifies the **resulting signed APK** via Android `apksigner` and `aapt`, and records immutable APK hash and source SHA in `owner-qa-405-provenance.json`.
- Stores only the signed Owner QA APK and non-secret manifest as a 7-day GitHub Actions artifact. Does not modify OTA manifest, Vercel, Supabase Staging, Production or real user data. No GitHub Release, no automatic employee rollout.

## Remaining tests on the Owner Android phone
Even if the workflow passes, the actual native update is **not yet accepted**. Owner must download the signed APK from the successful GitHub Actions artifact; install it over **0.4.4 without uninstall or Clear Storage**, check Android App info v0.4.5 and in-app state, retained login after close/relaunch, saved/unsent reports, new request save, notifications, profile, leave and other critical flows. Do not repeat the already confirmed 0.4.1→0.4.4 tests; only test changed 405 candidate.

Do **not** increment `MT_ANDROID_LAST_VERSION_CODE` to 405 merely on build success; update only after Owner has tested and approved distribution on the device.

## Explicit non-goals
- No new Supabase project/organization/database.
- No automatic OTA; OTA uses a **different Ed25519** key from Android keystore.
- No Production endpoint or employee rollout.
- No release of unreviewed GitHub main branch or test accounts.
- No forced logout, uninstall or deletion of local reports.

## First live Android build safeguard (run 39257753746)
The initial live Owner QA build confirmed PR #13 checks passed and assembled the Native source, but **stopped before Gradle/signing** at `CAPACITOR_SYNC_ASSET_LIST_DRIFT`. Capacitor adds generated runtime files to `android/app/src/main/assets/public` alongside the byte-for-byte copied source.

The refined check permits **only a short explicit allowlist** of generated Capacitor/WebView runtime names (`capacitor.js`, `capacitor.plugins.js`, `cordova.js`, `cordova_plugins.js`), still requires **every reviewed asset** to be present and identical, and rejects unexpected extra files, missing session bridge, changed HTML/JS or mismatched Gradle version. Tests cover all these conditions. A change to this workflow file triggers a fresh Owner-only build on protected ops after QA PASS; no rerun of the old SHA or signing attempt from the feature branch is permitted.
