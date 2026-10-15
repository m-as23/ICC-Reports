# MainTrack Stage 14 — Native OTA integration laboratory

Scope: isolate signed web bundle installation and deliberate rollback on Android without exposing Supabase users, reports, or production web deployments.

## Source and isolation
- Only branch: `android/stage14-ota-native-lab`; production `main` and deployed Vercel aliases are unchanged.
- `qa/stage14/healthy.zip` and `qa/stage14/faulty.zip` contain **test-only HTML**, no production data.
- Fixed commit-pinned HTTPS URLs hosted at `raw.githubusercontent.com`, digest from `qa/stage14/fixtures.json`.
- QA APK is built with standalone local testing UI, not the production UI. `autoUpdate: off` remains unchanged.
- Ephemeral Ed25519 private key generated per GitHub Action job; never committed or used for user release signing.
- Signed manifest must match native compatibility, HTTPS origin allowlist, checksum and bundle version.
- `localStorage.q` receives *synthetic* queued item during safety gate test; clears synthetic item before applying any bundle; no API or user-auth operations.
- A distinct non-sensitive localStorage sentinel checks persistence across OTA and native rollback.
- Native plugin `notifyAppReady()` called before network activity. Deliberately broken bundle lacks readiness and should trigger built-in rollback after timeout.

## Evidence and unresolved gates
- Deterministic fixtures generated and SHA-256 checks passed.
- 28/28 Stage13 tests passed with unified Web/Android builds.
- First Android35 run showed WebView Chrome 124 lacked WebCrypto Ed25519, so it correctly rejected a signed update; this surfaced device compatibility requirements.
- Fix: pinned pure-JavaScript `tweetnacl@1.0.3` fallback for verifying Ed25519; tampered payloads must still be rejected.
- Real native healthy swap and timeout rollback are **not accepted until both scenario jobs show explicit successful log markers**. A Gradle success or an Android process alone is insufficient.
- Do not permit OTA for employees or install a transition Release APK until this gate passes, the local queue integration is verified with the real UI, and a user-controlled Android release signing keystore is prepared.
- No paid service is required for the isolated laboratory; production hosting architecture must be reviewed separately.

## Evidence links
- Test matrix: https://github.com/m-as23/ICC-Reports/actions/workflows/maintrack-stage14-ota-device.yml
- Source branch: https://github.com/m-as23/ICC-Reports/tree/android/stage14-ota-native-lab
- Capgo updater reference: https://capgo.app/docs/plugins/updater/api/
