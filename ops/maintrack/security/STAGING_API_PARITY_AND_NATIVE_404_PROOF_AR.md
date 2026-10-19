# MainTrack — Proof of Android 404 native floor and isolated 32-action Staging client

## Verified and unverified
Owner reported changing GitHub Environment variable `MT_ANDROID_LAST_VERSION_CODE` to `404`. GitHub's connected repository integration **cannot read Environment variables**; this report does not claim verification from settings.

The new read-only GitHub workflow `.github/workflows/maintrack-native-env-floor-proof.yml` runs on the protected ops branch when merged. It enters the restricted `maintrack-android-release` environment and asserts the stored value is exactly `404` without printing it or accessing any secrets. PASS on that run is the first independent evidence of the saved value; FAIL requires Owner action and does not deploy.

## API parity
The original canonical `web/maintrack/public/secure-assets/index-inline-1.js` still contains the stage9 API URL (26-action deployment). DO NOT replace this in the deployed Web service or signed Owner 0.4.4 OTA.

A new deterministic `ops/maintrack/scripts/prepare-qa-api-client.mjs` first requires the **exact original Git blob SHA-1** `25f37b928eba7857d7ddff08362f575ee1224971`. It replaces the **one** literal old API URL with the same Supabase Staging project's `maintrack-unified-four-qa` endpoint (32 actions), leaving all other application code **byte-for-byte identical**. Its output and provenance are written under `audit-output/maintrack-qa-api-candidate/` only. No current Web or Android source file is mutated.

`check-next-release-api-parity.mjs --candidate` re-derives the exact expected bytes from the unchanged source, verifies SHA-256 and Git commit binding and demands the approved 32-action endpoint. The `Change QA Gate` runs both the isolated packaging proof and browser regression suite. The read-only `next-native-release-guard` uses this verification instead of rejecting the unmodified legacy canonical source.

The active Staging Supabase `maintrack-unified-four-qa` is version 15 at time of review, `maintrack-stage9-security-api` version 10. **No database migration or Edge Function deployment.**

## Still blocked
Passing this QA proof does **not** deliver Web or Android updates; the actual next native APK builder must consume the exact QA-aligned candidate, prove same installation certificate, package ID and code >=405, and pass Owner on-device upgrade/session/offline-queue acceptance. Signed OTA must use the separate pinned Ed25519 key. Legacy publishing workflows still need a dependency audit, and any employee rollout remains prohibited.

No new Supabase project, production deployment, secret read, package signing, Android app update, or source lock rewrite.
