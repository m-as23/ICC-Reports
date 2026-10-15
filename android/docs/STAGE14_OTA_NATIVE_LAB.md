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

Native OTA matrix commit tested: `f28555b5cfc93ba8edea9079588f89204d288fb9`.

GitHub Actions run [38774916224](https://github.com/m-as23/ICC-Reports/actions/runs/38774916224) completed successfully:

- Healthy Android 35 scenario: 29/29 Node tests passed; the native APK downloaded and scheduled the signed bundle; the healthy bundle ran and logged `MT_STAGE14_GOOD_LOCAL_STATE_PRESERVED`.
- Faulty Android 35 scenario: 29/29 Node tests passed; the native APK downloaded and scheduled the deliberately broken bundle; the native updater returned to `builtin` and logged `MT_STAGE14_ROLLBACK_PASS_BUILTIN_AND_LOCAL_STORAGE`.
- Both jobs logged `MT_STAGE14_PENDING_QUEUE_GUARD_PASS`, `MT_STAGE14_SIGNATURE_OK`, and `MT_STAGE14_BUNDLE_DOWNLOADED_AND_SCHEDULED`.
- These are real Android emulator download, activation, and rollback checks, not the mocked rollback unit test alone. No repeat emulator run is needed for this result.

## Actual MainTrack UI local-work gate — accepted

Integration commit: `422845c00bd55346ca94c79e8e2ca8351f0ba312`.

GitHub Actions run [38786455203](https://github.com/m-as23/ICC-Reports/actions/runs/38786455203) succeeded with **34/34 Node tests and 6/6 actual UI browser scenarios**. Its [non-sensitive evidence artifact](https://github.com/m-as23/ICC-Reports/actions/runs/38786455203/artifacts/11997033540) contains the scenario results.

- The emitted native build adds `stage14-local-work.js` after the existing app script. Its reader uses the real `q` array, actual report field values, and the existing submission/loading state. It returns counts and booleans only and never writes storage.
- All 18 approved shared resources still pass their original SHA-256 checks. The source under `web/maintrack/public` is unchanged.
- `stageMainTrackLabRelease()` verifies a signed lab envelope and reads actual local work before download and again before scheduling. It is prepared for integration testing and is not imported by app startup.
- A report created through the actual UI while offline survives closing the page and reopening in the same browser context. A fresh login with the same account resumes delivery; concurrent resend is blocked while submission is pending.
- Another account cannot drain that report. The guard counts retained reports from all accounts, including rejected items.
- Hidden report drafts, active submission, malformed queue data, missing runtime state, and a report arriving during download defer updates. Queue data remains untouched by the guard.
- A lost acknowledgement retains the queued report and retry reuses its `cid`. The mock backend deduplicates by account plus `cid`; production backend idempotency was not tested in this run.
- The browser suite uses localhost and intercepts every external request. It uses synthetic accounts and an in-memory backend, with a mocked native updater. No live backend or employee device is contacted.
- No Android emulator matrix was repeated for this read-only integration. The native matrix trigger still covers its actual signature, policy, readiness, fixture, and native QA inputs; UI local-work changes have a separate fast workflow.

Reproduction and test scope: [`tests-browser/README.md`](../maintrack-app/tests-browser/README.md).

## Evidence scope

The corrected persistence assertion checks a separate localStorage sentinel that is **not intentionally cleared** before OTA. It proves that localStorage survives the healthy bundle switch and native rollback.

The actual UI suite proves queue persistence through closing/reopening and guarded recovery/delivery. It prevents OTA while queued work exists. It does not force an update with a report in the queue. Native queued-data compatibility/migration through a bundle swap and rollback remains a release gate.

## Secure update status and remaining gates

Stage 14 laboratory acceptance is complete; employee OTA is still disabled. Do not connect the lab updater to employee devices or publish a mandatory policy until all remaining gates are completed:

1. Define and test queued-data schema compatibility/migration through healthy native OTA and rollback. The actual UI persistence, session binding, and deferred-update integration gate above is complete.
2. Cover the final activation boundary: work created after scheduling must remain recoverable on the next launch. Extend draft/submission protection to other editable application screens before enabling employee updates.
3. Have the owner create and retain the production signing key outside GitHub source; pin only its public key in the signed native app.
4. Select the update hosting and distribution model. Keep spending and production deployment disabled until the owner chooses them.
5. Build a separate release pipeline with protected environment approval, signed metadata, immutable artifacts, staged optional rollout, and an immediate rollback path.
6. Test the signed Release APK and offline startup on a user-controlled Android device before any employee pilot.

Native code changes still require a signed APK. Web OTA must remain fail-safe for startup and fail-closed for untrusted manifests. Never merge this branch into `main` or deploy it as part of this laboratory task.

## Evidence links

- [Stage 14 test matrix](https://github.com/m-as23/ICC-Reports/actions/workflows/maintrack-stage14-ota-device.yml)
- [Actual UI local-work workflow](https://github.com/m-as23/ICC-Reports/actions/workflows/maintrack-stage14-local-work.yml)
- [Isolated source branch](https://github.com/m-as23/ICC-Reports/tree/android/stage14-ota-native-lab)
- [Capgo updater API](https://capgo.app/docs/plugins/updater/api/)

## Activation boundary follow-up — implementation under verification

The actual UI integration no longer calls `next()`: it downloads a candidate without
arming a background/restart activation. A separate user action acquires a temporary
UI lease, re-verifies the signed envelope at the current time, refuses any native
pending bundle, and rechecks local work immediately before `set()`. An uncertain
native outcome keeps the old page locked; only a proven pre-switch refusal unlocks it.

The read-only data contract keeps the existing `q` array, account and `cid` identity,
including rejected rows and unknown extra fields. Destructive migration is not an
accepted OTA contract. Additional editor tracking covers profile, leave, credentials,
admin, catalogs and work orders, and tracks all requests through the existing `post()`
helper without modifying the 18 locked frontend resources.

Native readiness now waits for the locally loaded UI and compatible storage reader;
it does not wait for an API or connectivity. Acceptance results for this follow-up
must be recorded below before treating these new boundaries as verified.
