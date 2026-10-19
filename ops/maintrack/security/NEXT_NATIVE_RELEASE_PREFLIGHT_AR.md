# MainTrack — Next Native APK Guard / Owner setup

**Status:** QA-only preflight, not a signed APK build and not a deployment.

## Why this exists
The installed Owner phone is already on MainTrack Android `0.4.4` / `versionCode 404`. The next native APK needs a higher versionCode (at least 405), the unchanged `com.icc.maintrack` package and the same signing certificate. The earlier 0.4.4 Owner QA signer is an archival build path, not a general future-release mechanism.

**The current GitHub Environment variable `MT_ANDROID_LAST_VERSION_CODE` was observed as `0` in Owner's GitHub screenshot, which is stale.** Before the next native release, the Owner should open:

https://github.com/m-as23/ICC-Reports/settings/environments

Select `maintrack-android-release` → Environment variables → `MT_ANDROID_LAST_VERSION_CODE` → Edit → value `404` → Save.

This value must represent the highest native APK `versionCode` actually distributed, not the OTA Web bundle version. Update it **only after** a newly distributed native APK is accepted; never lower it.

## New preflight
`.github/workflows/maintrack-next-native-release-guard.yml` is intentionally *read-only* and only permits the protected ops branch. It requires:
1. Exact reviewed commit SHA and passing combined `MainTrack Staging-only QA — required combined result` from the same commit;
2. Registered Owner QA Android certificate + app ID;
3. Native versionCode at least 405 **and greater than** the Environment last version (which must be >=404);
4. A matching 32-action QA API in the current Web canonical source. The source still contains the legacy 26-action URL, so this **must currently block release**;
5. Employee publishing stays disabled.

The workflow **does not** build/sign an APK. The future release signer will need to invoke the same candidate guard before native build and again after actual APK signing, checking `apksigner`, `aapt` and SHA-256; it must not be deployed until Web/Android source parity and source SHA are approved.

## Current development restrictions
- Keep Staging Supabase; no new database required yet.
- The 0.4.4 Owner tested app and OTA remain untouched.
- The older Owner QA 0.4.4 artifact cannot be presented as a higher-version native release.
- Signed Web OTA and Android APK are different formats, with different signing keys; do not confuse them.
- Any new feature needs an isolated PR and QA, Owner acceptance, then explicit approval for **that exact version**.
- Since repository default `main` is still legacy, GitHub `workflow_dispatch` visibility may depend on GitHub's default-branch restrictions. Do not switch the default branch or publish legacy `main` just to make a workflow appear. Exact-commit protected preflight and release builder remain to be operationalized separately.

**Expected blocker now:** Environment 0 rather than 404, and canonical Web source references legacy stage9 endpoint rather than the approved unified-four QA endpoint. Both must be resolved before a native release candidate can be signed.
