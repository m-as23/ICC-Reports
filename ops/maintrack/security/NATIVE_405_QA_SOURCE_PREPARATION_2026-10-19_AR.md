# MainTrack Native 0.4.5 QA Source Preparation — 2026-10-19

## Purpose
Prepare the **next unsigned, unpublished native Android source candidate** while preserving the existing Owner-installed 0.4.4 app and its local state. This is **not** an APK, an OTA manifest, a Production release or permission to deploy.

## Immutable inputs and guarantees
- Source of Truth remains `web/maintrack/public` on the reviewed GitHub commit. The JS source is pinned to immutable Git blob `25f37b928eba7857d7ddff08362f575ee1224971`.
- Use `prepareAlignedClient` to switch **exactly one API URL** (old 26-action Staging service to currently approved 32-action Staging QA service). Nothing else in the main JS is rewritten.
- Copy the complete Web asset tree to `audit-output/native-405-qa/www`, refusing symlinks and unsafe paths. Existing canonical Web and old Android OTA are untouched.
- Inject `stage13-native-ready.js` for native boot health, `stage20-native-session.js` from `update-system/native-session-entry.mjs` for AndroidKeyStore-backed session continuity, and `stage14-local-work.js` from `update-system/local-work-startup.mjs` for offline queue/activation safety. The external scripts remain covered by the original CSP. Inject the session bridge before app JS and the offline bridge after it.
- Generate an asset SHA-256 manifest with exact Git commit SHA, app ID, native version proposal **0.4.5 / 405**, QA backend and `rollout:false`.
- Run source/HTML/inventory tests with no signing privileges; generate the full staged bundle in GitHub Change QA. The same step is added to the optional protected next-native preflight workflow.

## Follow-on work — NOT complete
Before producing a signed Android APK, a later explicitly approved workflow must:
1. Fetch and inspect the exact reviewed current Git commit and named combined QA PASS; enforce environment `MT_ANDROID_LAST_VERSION_CODE>=404` and `405>last`.
2. Build Android Native app from the verified `audit-output/native-405-qa/www` candidate after `cap sync`, not from the obsolete snapshot/0.4.4 archived ZIP. Assert exact generated file tree hashes before/after transfer.
3. Ensure the same package `com.icc.maintrack`, same native certificate SHA-256 and new versionCode (405 or higher). Only allow Owner QA signing within `maintrack-android-release` environment; do not publish a native APK without Owner approval of that specific version.
4. Test **in-place upgrade preserving login, AndroidKeyStore, local pending reports and rollback** on Owner phone. No uninstall or clearing app data.
5. Keep employee rollout prohibited, and continue using current Supabase Staging project; no production deployments.

## Review of open PR #8
PR #8 also built a QA client and validated GitHub Environment version floor, but overlapped merged PR #9 and now has merge conflicts. This candidate preserves its useful full-asset and symlink protections without merging conflicting changes blindly. No PR #8 changes have been merged.

**No Android signing key used; no APK or OTA distributed; no Web deploy; no Supabase write.**
