# MainTrack Stage19 — actual Web update QA preview and deterministic Chromium gates

Date: 2026-10-17. Git branch: `android/stage14-ota-native-lab`. No merge to `main`, Production deployment, Supabase database migration, public APK release or signed OTA publication.

## Published Web preview

- Isolated protected Vercel QA project: `maintrack-final-security-qa` (`prj_7l6q0Qx7vV7K5LP52MUNXjBOD3ZQ`).
- Actual Preview deployment: `dpl_2shHiVrXgFdi99zgqNjMLDrnaYTQ`, status **READY**; URL: https://maintrack-final-security-gpnpu344u-mohamedashrefsrag-5918.vercel.app
- Source commit: `3a09d2308ee4e2e3c9bdfb601419c5de124f4d9e`, reviewed in [Stage18 CI #17](https://github.com/m-as23/ICC-Reports/actions/runs/39020300719).
- Vercel project preview protection remained enabled. The unique Preview deployment has **no production alias** and is not an in-place upgrade to an existing served hostname.
- The immutable candidate was independently rebuilt at that pinned commit in an ephemeral Vercel Sandbox. Critical SHA-256 hashes for index.html, bundled Web updater JS, MainTrack core JS and native-safety JS matched the original GitHub Actions artifact. Upload used SHA-1-addressed chunks and a build-stage checksum verification before extraction (`site.tar.gz: OK`). The temporary Sandbox sessions were subsequently stopped.
- Live protected HTTP inspection: `/maintrack-release.json` returned 200 `application/json`, `Cache-Control: no-store`, `schema=1`, `channel=web-pilot`, and the exact pinned commit. The release directory index returned 200 and `secure-assets/web-update.js` returned 200 `application/javascript`, with `DISCOVERY_INTERVAL = 30 * 60 * 1000` and DOM creation for `#maintrack-web-update`.
- The one-release preview's metadata expires **2026-10-23 at 09:34:31 UTC**. This is for temporary QA, not a self-maintaining employee channel.

## Additional real-UI Chromium regression

- Added `tests-browser/web-update.browser.test.mjs`. Extended `tests-browser/package.json` and workflow path filters to always execute it in the established Ubuntu Chromium CI.
- [Stage19 CI #18](https://github.com/m-as23/ICC-Reports/actions/runs/39023346960) on test commit `6a04541f0fdf27205f984621b8b401821c28828f`: **79/79 Node tests**, **23/23 Chromium tests**, passing both new Web Pilot cases, no failures.
- Browser fixture loads the **generated pinned Web Pilot HTML and scripts** from an isolated local HTTP server, not a mock rewrite of its update panel. External API/network requests are blocked.
- Case 22: while metadata matches the loaded commit, the update ASIDE and apply button exist in the real DOM but remain hidden; the manual check control exists in the profile DOM; repeated focus events do not cause repeated metadata requests.
- Case 23: a **simulated, valid same-origin newer release metadata response** makes the visible apply button appear; one metadata request is made, and no download or navigation is triggered. No user credentials or report data are involved.

## Evidence limitations and remaining release gates

- A TinyFish read-only visual smoke test reached the MainTrack login page, but its follow-on claimed a script path `assets/js/web-update.js` that does **not** occur in the deployed HTML. That path 404s; the actual page references the working `secure-assets/web-update.js`. Treat the TinyFish DOM claim as conflicting/inconclusive, not as a confirmed implementation failure. The independent deterministic CI Chromium test above validates real Web Pilot DOM behavior against the packaged assets.
- Chromium in the temporary Amazon Linux Vercel Sandbox could not maintain a browser session during a navigation (even to localhost), despite being launchable. The **hosted** QA browser's hidden DOM was therefore not proven by that Sandbox; do not misdescribe a local CI browser run as hosted end-to-end evidence.
- No two-release upgrade was tested under one stable QA hostname. The current Preview intentionally contains **only** the current commit; there is no prior-release history to retain on this new immutable hostname. Before a stable QA alias is advanced to another candidate, preserve `/releases/<previous-commit>/` directories and test old tabs, QR query/hash preservation, reload, installed PWA behavior and unsent reports.
- The immutable Web source and Android UI/OTA candidate share the reviewed Stage18 source, but **a new owner-signed compatible Android OTA** was not published. The prior lab release 0.4.2 is a different older source. APK signing continuity, owner-controlled production certificate, device-data preservation, and the signature/compatibility verification gate still apply. Native plugin/permission changes require a signed APK, not only an OTA ZIP.
- Supabase Staging was reviewed read-only and reported healthy; no API functions, schema, users, reports or permissions were changed. Browser tests used an in-memory mock rather than logging in to the live Staging backend.
- Coordinated publication of Web and Android release pointers can be prepared from the same pinned Git SHA, but it cannot guarantee **instantaneously simultaneous** client detection or installation. Clients act on availability when they next check and when users approve.

**Stage19 disposition:** Isolated Web QA deployment READY; current/newer update UI behavior PASS under deterministic Chromium CI; hosted two-version transition and newly signed Android device delivery remain **PENDING**. Do not promote, publicize to employees, or advance release pointers until those gates pass.
