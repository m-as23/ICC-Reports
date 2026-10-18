# MainTrack Stage22 coordinated Web + Android adoption (owner approved)

## Audit: 2026-10-18

- Reviewed accepted UI source: commit `f5c9d78c6e0b135549c9efc9608d1f0df02ecf8e`.
- Passed synthetic Android35 WebView / offline queue gate: [run 39118982667](https://github.com/m-as23/ICC-Reports/actions/runs/39118982667).
- Isolated release-preparation branch: `release/maintrack-stage22-web-android-20261018`; **not** `main` nor `android/stage14-ota-native-lab`.
- Source-locked unsigned coordinated 0.4.4 Web/Android archives and signed previous-release verification: [run 39127236099](https://github.com/m-as23/ICC-Reports/actions/runs/39127236099), `MainTrack-Stage22-0.4.4-UNSIGNED-Release-Preflight`.
- This preparation workflow is **not** a release operation: the Web metadata expires at zero, the mobile zip is unsigned, and the package declares rollout disabled. These review archives must not be uploaded to active release channels.
- Existing signed Android lab channel advertises **0.4.3**, `com.icc.maintrack`, verified Ed25519 signature and local-data contract `{reportQueue:1,writesReportQueue:1,migration:"none"}`.
- The verified candidate API provides 32 actions, retaining all 26 stable actions and adding six `accountSummary`, `overtimeMine`, `overtimeRequest`, `overtimeDecision`, `overtimeInbox`, `overtimeSummary`. Static parity alone does **not** establish safe role-based live writes.
- Exact v10 rollback source and v15 QA candidate source are pinned in `release/stage22/backend/`.
- Repo `main` still contains an older Google Apps Script `index.html` that cannot be assumed to be the deployed production Vercel Web app. The Vercel project known to the release process is explicitly `maintrack-final-security-qa`. The **actual stable Web domain and project must be supplied or independently verified before alias changes**.

## Required ordered promotion gate

1. Resolve the **currently used stable employee Web URL**, project ID, and existing version history. Preserve same-origin sessions, offline local work and older versions; don't replace the known QA project alias to simulate production.
2. Stage the approved backend candidate *separately*, verify role-bound Owner/Engineer/Technician flows and older-client compatibility, create/close a synthetic maintenance report, and exercise leave and overtime approval/notification changes against an explicitly approved isolated or synthetic data set. QA and stable Edge functions share one Postgres DB; never assume staging is isolated. Compare permissions and fall back to the saved v10 source on regression.
3. Pin the **identical reviewed Stage22 frontend bytes** for both native OTA ZIP and immutable Web `/releases/<sha>/`, and validate the real host's no-store `maintrack-release.json`, older-tab rollback, and offline unsent-report / overtime draft guards.
4. On the protected `maintrack-android-release` GitHub environment, sign only the new immutable Android **0.4.4** OTA bundle using the **existing** private key matching `release/owner-public.json`. Require Ed25519 signature, SHA-256, immutable URL, version monotonicity, native min/max, queue schema, expiry and owner environment approval. Publish the signed manifest only during the coordinated Web rollout.
5. Verify the installed MainTrack 0.4.1 native trust root recognizes the signed 0.4.4 OTA and activation preserves queued reports; use an existing real device only for the short final acceptance. **Native Android App Info may still show 0.4.1 after successful OTA**; OTA updates its WebView UI, not native package version.
6. If the native secure-session plugin or manifest permissions must be upgraded, a new signed **APK** is required; build only if the Android package is exactly `com.icc.maintrack` and the signer certificate matches the installed release, with increased versionCode. The QA `com.icc.maintrack.stage22qa` Debug APK must never be installed over the original or be used to prove in-place compatibility.
7. Once all gates pass, advance stable Web + signed Android LAB manifest, confirm version checks show update button **only** with a new trusted release, monitor logins/report submission/approvals/notifications and retain last good bundles for rollback.

## Current decision

**PREPARED_NOT_PUBLISHED.** Owner approval to release is recorded, but there is no verified live stable Web origin, no successful authenticated backward-compatible stable API acceptance run, and no signed 0.4.4 OTA. Production deployment would risk user data and violate the preservation gate.

Never clear existing production/pilot data, merge unreviewed source into `main`, overwrite a signed OTA ZIP, replace any owner-held signing keys, or ask the owner to uninstall their existing MainTrack.
