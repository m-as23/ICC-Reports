# MainTrack Android Stage 11 — Signed Release preparation

The isolated Android project already builds a Debug APK and passed a launch smoke test in Android 14 emulator.

**Signed Release is deliberately disabled.** Debug APKs use temporary developer certificates and are not appropriate for permanent staff distribution.

The release workflow `.github/workflows/maintrack-android-stage11-release.yml` enforces the committed `package-lock.json` and `approved-assets.lock.json` from the successful reviewed build.

Before enabling a signed release:
1. Finish real-Android acceptance of login, reports, dashboard, offline draft, background/resume, and logout.
2. Generate a **user-controlled** Android signing keystore offline and back it up securely. Never commit the keystore, signing passwords, or Base64-encoded private material.
3. Create GitHub Environment `maintrack-android-release`, requiring manual approval when supported.
4. Set four **Environment Secrets**: `MT_ANDROID_KEYSTORE_BASE64`, `MT_ANDROID_KEYSTORE_PASSWORD`, `MT_ANDROID_KEY_ALIAS`, `MT_ANDROID_KEY_PASSWORD`.
5. Set repository variable `MT_ANDROID_SIGNING_READY=true` only after review, then deliberately dispatch the workflow once available in GitHub Actions.
6. Use monotonically increasing Android `versionCode` for future releases. Store the keystore securely for future updates.

Do not merge Android code into `main` or deploy over existing MainTrack web URLs without separate explicit authorization.
