# MainTrack 0.4.4 — Android Signing Key Matched Installed Owner App

## Result: PASS (certificate continuity; no APK built)

- Verified run: https://github.com/m-as23/ICC-Reports/actions/runs/39168832463
- Job: `compare-certificate`, conclusion: `success`.
- Log result: `MAINTRACK_OWNER_ANDROID_SIGNING_PROBE PASS: INSTALLED_CERT_MATCH_AND_PRIVATE_KEY_USABLE_NO_APK_BUILT`.
- User's current installed Android app certificate SHA-256: `07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b`.
- The runner loaded only the four existing `MT_ANDROID_KEYSTORE_*` / `MT_ANDROID_KEY_*` secrets from GitHub environment `maintrack-android-release`, exported the public leaf X.509 certificate, checked its SHA-256 fingerprint against the installed-app fingerprint and independently checked `MT_ANDROID_EXPECTED_CERT_SHA256` is the same.
- A private-key entry was present and a temporary CSR was successfully signed with the existing signing key and configured password. Test temporary files were deleted by `TemporaryDirectory` when test completed.
- No private keystore/password/CSR/certificate bytes were printed, uploaded, released, or committed.
- No APK built, APK signature generated, Android OTA release published, Vercel deployment, Supabase/backend modification, data migration or merge to `main`.

## Remaining before in-place signed candidate

1. Establish the **actual installed Android `versionCode`** from a source tied to the owner's device. `MT_ANDROID_LAST_VERSION_CODE=0` is an environment variable, **not reliable evidence of the installed code**. Do not guess. New signed APK must preserve `applicationId=com.icc.maintrack`, have the **same SHA-256 signing certificate**, and a strictly greater `versionCode`.
2. Build the native Android artifact from the approved immutable 0.4.4 content, with exactly two UI assets changed to remove bottom dock, plus the already QA-tested Android Keystore session plugin. Do not change backend endpoints, local data contract, navigation elsewhere, or OTA trust/configuration.
3. Protect GitHub environment `maintrack-android-release` before any release pipeline: screenshot shows `Deployment branches and tags: No restriction`. Prefer a restricted, reviewed signing path; only change environment settings with owner approval.
4. Isolate signing credentials to a **single signing step** after build and tests, never expose credentials during checkout, npm install, or package compilation. Use a dedicated runner with no reusable credentials and no outputs containing secrets.
5. Verify certificate, app ID, version name/code, installed-data continuity, offline force-stop, explicit logout, and unsent queue before releasing. Real owner's device still needs final validation.
6. Avoid install -r or any published OTA on the owner's device until signing and compatibility proofs pass.

## Scope retained

- Actual product-side edits so far: `web/maintrack/public/v6-core.js`, `web/maintrack/public/v6-core.css` only (delete bottom bar; original sidebar unchanged).
- Session bridge is preexisting Android native source; synthetic Android emulator QA passed in run `39164088303`.
- No live app/source/backends changed. Other changed files on branch are QA tests, workflows and reports only.
