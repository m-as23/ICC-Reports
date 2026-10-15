# MainTrack Stage 14 — Native OTA integration laboratory

## Scope

Prove signed web bundle download, activation, readiness rollback, and preservation of non-sensitive local storage on an isolated Android test build. The laboratory does not connect to Supabase, authenticate users, deploy web assets, or enable employee updates.

## Isolation and security controls

- Work is confined to `android/stage14-ota-native-lab`. Production `main` and deployed Vercel aliases are unchanged.
- `qa/stage14/healthy.zip` and `faulty.zip` are test-only HTML, with no production data.
- Fixture HTTPS URLs are pinned to an immutable Git commit and checked against the recorded SHA-256 and byte count.
- GitHub Actions builds a standalone QA APK, not the production UI.
- The QA manifest uses a per-job ephemeral Ed25519 key. The private key is never committed and is not a release-signing key.
- The verified manifest binds app/channel, version, native compatibility, HTTPS origin, expiry, ZIP size, and checksum.
- The updater plugin remains configured with `autoUpdate: "off"`; no production update endpoint or release key is configured.
- The safety gate inserts only a synthetic queue item, proves the queue guard blocks activation, and clears that item before applying a bundle. No API or account is used.
- A separate non-sensitive localStorage sentinel checks browser storage across healthy activation and native rollback.
- The broken bundle deliberately omits `notifyAppReady()`; the native plugin must restore the built-in bundle.

## Confirmed evidence — 2026-10-15

Latest branch commit tested: `f28555b5cfc93ba8edea9079588f89204d288fb9`.

GitHub Actions run [38774916224](https://github.com/m-as23/ICC-Reports/actions/runs/38774916224) completed successfully:

- Healthy Android 35 scenario: 29/29 Node tests passed; the native APK downloaded and scheduled the signed bundle; the healthy bundle ran and logged `MT_STAGE14_GOOD_LOCAL_STATE_PRESERVED`.
- Faulty Android 35 scenario: 29/29 Node tests passed; the native APK downloaded and scheduled the deliberately broken bundle; the native updater returned to `builtin` and logged `MT_STAGE14_ROLLBACK_PASS_BUILTIN_AND_LOCAL_STORAGE`.
- Both jobs logged `MT_STAGE14_PENDING_QUEUE_GUARD_PASS`, `MT_STAGE14_SIGNATURE_OK`, and `MT_STAGE14_BUNDLE_DOWNLOADED_AND_SCHEDULED`.
- These are real Android emulator download, activation, and rollback checks, not the mocked rollback unit test alone. No repeat emulator run is needed for this result.

## What this evidence proves—and does not prove

The corrected persistence assertion checks a separate localStorage sentinel that is **not intentionally cleared** before OTA. It proves that localStorage survives the healthy bundle switch and native rollback.

It does **not** prove that a real employee's queued report survives an update. The synthetic queue item is intentionally cleared after proving that the safety guard blocks switching. A local queue migration/preservation test against the real UI and its actual queue schema remains a release gate.

## Secure update status and remaining gates

Stage 14 laboratory acceptance is complete; employee OTA is still disabled. Do not connect the lab updater to employee devices or publish a mandatory policy until all remaining gates are completed:

1. Verify local queued-report persistence and recovery using the real MainTrack UI and a mock/test backend, including no data loss across healthy OTA and rollback.
2. Define and test a queue-schema compatibility/migration rule for updates.
3. Have the owner create and retain the production signing key outside GitHub source; pin only its public key in the signed native app.
4. Select the update hosting and distribution model. Keep spending and production deployment disabled until the owner chooses them.
5. Build a separate release pipeline with protected environment approval, signed metadata, immutable artifacts, staged optional rollout, and an immediate rollback path.
6. Test the signed Release APK and offline startup on a user-controlled Android device before any employee pilot.

Native code changes still require a signed APK. Web OTA must remain fail-safe for startup and fail-closed for untrusted manifests. Never merge this branch into `main` or deploy it as part of this laboratory task.

## Evidence links

- [Stage 14 test matrix](https://github.com/m-as23/ICC-Reports/actions/workflows/maintrack-stage14-ota-device.yml)
- [Isolated source branch](https://github.com/m-as23/ICC-Reports/tree/android/stage14-ota-native-lab)
- [Capgo updater API](https://capgo.app/docs/plugins/updater/api/)
