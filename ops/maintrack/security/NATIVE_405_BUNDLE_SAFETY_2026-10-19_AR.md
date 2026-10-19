# MainTrack — Staging Web API parity + Android secure-session release boundary

## Purpose
Use a single reviewed Web client source in Browser QA while preserving the **existing installed Android 0.4.4 / versionCode 404**. The Web source itself remains frozen and still contains the historical API URL, so it cannot be published as a new Web or Android build without an approved source transformation.

## Completed in this PR
- `prepare-complete-staging-web.mjs` copies all canonical Web assets to a **separate audit-output** folder and changes exactly one JavaScript API URL to the approved 32-action `maintrack-unified-four-qa` service within **the current MainTrack-Staging Supabase project**.
- All other files are copied byte-for-byte; SHA-256 for every file, changed-files list, original Git blob pin and commit provenance are checked; symlinks and unsafe output paths are rejected.
- Browser QA reads the generated Staging client. Both local-work and unified-four tests intercept the updated QA endpoint, with **mock responses only**.
- `check-next-native-session-assets.mjs` requires the native `stage20-native-session.js` script to be both present and loaded by HTML before a future Android APK build. **Canonical Web does NOT contain this file**; the vetted 0.4.4 signed Android OTA archive includes it. Therefore a plain Web QA bundle is *not* an installable Android app, even if all browser tests pass. The next release preflight deliberately fails until an exact approved Native WebView assembly step is added.
- Only QA fixtures are modified. No Production and no employee release.

## PR #8 reconciliation
PR #8 overlaps with the already merged PR #9 and contains source-copy safeguards and browser API alignment. This PR implements those relevant checks against the **post-PR9** canonical branch. Do not merge both overlapping PRs; close PR #8 as superseded only after validation of this PR.

## Remaining for new Android native APK
1. Assemble WebView assets from reviewed full Android 0.4.4 session-safe bundle or implement an independently reviewed bridge-preserving source assembly; check its trusted SHA-256, native plugin and offline queue contracts.
2. Require exact commit QA, protected Environment native last versionCode `404`, requested versionCode `405+`, unchanged `com.icc.maintrack` package and signing certificate.
3. Build and sign a **QA owner-only** artifact only after explicit approval for its exact code/content; verify final APK bytes/certificate; perform upgrade on owner phone without uninstall; verify local reports, session, rollbacks.
4. Freeze or retire legacy write/publish workflows after dependency audit. **No background publishing and no Production/employee rollout.**

This PR is a prerequisite and **does not generate, sign, distribute or publish** an Android APK or OTA. No Vercel, Supabase schema, Staging data or credentials were changed.
