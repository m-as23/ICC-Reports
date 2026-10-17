# MainTrack — Stage 17 update discovery QA gate (2026-10-17)

## Scope and isolation
- Only `android/stage14-ota-native-lab`; `main` and Production were not changed.
- Accepted source head: `38dbcfacdd7a2a8eaa3d1c1fda62ba0297766e3d`.
- This is **candidate/QA readiness**, not an employee release, signed APK or live deployment.

## Implemented
- A silent, deferred metadata check on first foreground launch.
- The same discovery helper is used by opt-in Web and native APK pilot panels.
- Every 5 minutes while visible and online, with a single outstanding request and a single scheduled timer.
- A focus event, visibility return or reconnection can check when the interval is due; repeated focus does not produce duplicate requests.
- Hidden/offline state cancels periodic scheduling; foreground/online re-entry resumes.
- Server/validation failure is silent for automatic checks and retried only after throttling; explicit user-initiated checks remain available.
- 'تحديث متاح' is hidden when no newer compatible release is confirmed.
- Checks never download, activate, navigate, reload or wait on app login. Activation remains explicit and guarded by report/queue/edit checks.
- Metadata-only HTTP requests remain limited by the existing Web (8 KiB/5 seconds, same origin) and Android lab (16 KiB/3 seconds, signed release) constraints.

## Automated verification
- GitHub Actions run: https://github.com/m-as23/ICC-Reports/actions/runs/39019150801
- Main QA packaging job: **SUCCESS**; **73/73 Node tests**; 9 release/preflight tests passed.
- New tests cover periodic foreground polling, deduplication, background/offline pause, reconnection, manual checks, and network-failure throttling.
- Existing Web UI test harness was corrected for the normal few-millisecond difference between `Date.now()` and a scheduled timer. Initial run https://github.com/m-as23/ICC-Reports/actions/runs/39019000747 failed only on that exact-millisecond test assertion; rerun using the amended fixture passed 73/73.
- Review artifact: https://github.com/m-as23/ICC-Reports/actions/runs/39019150801/artifacts/12095893020
- GitHub generated unsigned candidates and an isolated static Web preview with live backend blocked. No APK was signed or distributed, and no alias was changed.

## Live deployment and employee release gates
1. This commit has **not** been deployed to Vercel or installed on a physical phone. Earlier Stage17 hosted two-version Web upgrade acceptance is separate evidence; repeat against the new candidate before announcing release.
2. Vercel team currently lists no linked Git projects for automatic branch-to-preview publication. A reviewed candidate must be deliberately deployed to the existing isolated QA project using its build output, never Production.
3. Hosted smoke test: fresh browser opens old release, update badge appears only for newer release, Apply performs guarded same-origin navigation, current release hides badge, refresh stays quiet; repeat while leaving an old tab open for over 5 minutes.
4. Test installed PWA behavior, authenticated login/session, QR query retention, unsent report/dirty form safety, and cross-version backend compatibility on synthetic data only.
5. Android lab/personal-device work previously passed emulator OTA/APK checks but is **not** employee distribution. Permanent owner-controlled signed Release keys, compatible replacement APK and a real-phone in-place acceptance remain mandatory. The old temporary OTA key cannot sign follow-up bundles.
6. Never override local work protection or clear device storage to force a passing update. Keep an explicit rollback plan and stable historical Web release paths.
