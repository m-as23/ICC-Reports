# MainTrack Stage18 — synchronized Web and Android update candidate

Date: 2026-10-17. Branch: `android/stage14-ota-native-lab` only. No `main` or Production changes.

## Intent
Publish the same approved shared MainTrack UI changes to the Web channel and compatible Android UI OTA channel, and expose **تحديث متاح** only after each client independently verifies an available release. Users explicitly start applying an update; there is no background download or auto-navigation.

## Changes
1. Discovery is a deferred metadata-only request on startup and at most once per 30 minutes in a visible online app. Focus, connectivity changes and visibility resume respect the same cooldown. Concurrent checks coalesce; checks stop while hidden/offline. A manual check may bypass the cooldown.
2. Android signed OTA: automatic discovery does not cancel a prepared download (`ready`) or an existing blocked/unsent-work retry. Manual refresh may recheck a blocked candidate. Signed manifest, native-version compatibility, local-work protection and explicit click activation remain mandatory.
3. Web: current-version status remains hidden unless the user asks to check, while the update button appears only when same-origin metadata identifies a different approved commit. Applying always repeats the metadata and local-work checks.
4. Safe rollout packaging: `scripts/prepare-web-pilot.mjs` can copy historical, immutable `/releases/<commit>/` directories from a trusted previous Vercel build before generating a new version. Invalid names, missing historical entries, symlinks, or overwrites are rejected. Publishing an upgrade to an existing host **MUST** set `MT_WEB_PREVIOUS_STATIC_DIR` to a locally available previous `.vercel/output/static` tree and `MT_WEB_REQUIRE_HISTORY=true`. Without this, packaging is only for a **new isolated** Preview and cannot replace an existing served origin safely.
5. `.github/workflows/maintrack-stage14-candidate.yml` verifies both opt-in update frontends from the **same pinned Git SHA**, compares the locked shared assets by SHA-256, and exports `web-pilot-build-output.zip` inside the review artifact. The Web PWA manifest and platform-specific index.html are intentionally different. Native lab public config is tested without any private key. Browser work-guard regression is also required. No credentials or live backend used in this CI QA path.

## Evidence and limitations
- [Stage18 candidate build and browser QA](https://github.com/m-as23/ICC-Reports/actions/runs/39020300719).
- [Stage18 first shared-packaging PASS (79 Node tests)](https://github.com/m-as23/ICC-Reports/actions/runs/39020125406).
- Existing Stage17 hosted baseline->candidate Web upgrade is separate and cannot prove the updated 30-minute timer or native device delivery.
- Web pilot metadata currently has six-day expiry: the actual release publisher must refresh metadata before its expiry or adopt a vetted longer-lived metadata scheme before an employee rollout.
- Existing QA Vercel deployment does **not** contain this candidate. A historical-release-preserving deployment to isolated QA, hosted same-origin test, authenticated/installed PWA test and a device test still gate release.
- Existing owner-signed Android OTA channel `lab` advertises 0.4.2 from an earlier source commit; this Stage18 code is **not** in 0.4.2. A **new**, compatible owner-signed OTA/version must be deliberately published after both channel artifacts are tested and staged. Owner's permanent APK signing certificate/employee Release and on-device in-place upgrade remain separate gates. Do not publish a new OTA automatically from a source-code push.
- Shared UI upgrades can be distributed through Web and compatible Android OTA; Android native plugin/permission/runtime changes require a newly signed **APK**, not a Web ZIP.
- Existing synthetic-only Android emulator and in-browser checks do not establish that a physical employee phone will preserve its most recent unflushed local write. Never uninstall/clear app data to work around signing failures.

## Release acceptance checklist
- [ ] Pin the exact reviewed Git SHA for both channel builds and validate their shared-resource hashes.
- [ ] Stage the new Web release with every still-referenced old release directory available, no-store metadata and verified host routing.
- [ ] Stage a signed **compatible** OTA ZIP/version with owner key in the approved lab environment; check signature, checksum, expiry and version range.
- [ ] Verify fresh Web, old Web, installed PWA and installed Android each show no update button while current, and show it for a genuine newer release.
- [ ] Validate safe user activation and unchanged report queue/session/QR query; test offline, slow metadata host, in-flight report, dirty form and rollback.
- [ ] After QA acceptance and explicit owner approval, publish both channel release pointers. Monitor errors. Never automatically push directly to Production.

