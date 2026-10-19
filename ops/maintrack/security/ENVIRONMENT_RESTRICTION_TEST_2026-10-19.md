# MainTrack — Release Environment Access & Native Version Floor, 19 October 2026

## Live tested controls
- GitHub ruleset [MainTrack Reviewed Changes](https://github.com/m-as23/ICC-Reports/rules/25393921) returned Active, applied to the exact ops branch and required the named combined QA status, with an empty bypass list. A separate PR test confirmed FAIL blocks and PASS allows mergeability (no merge performed).
- The Owner configured the GitHub Actions Environment named maintrack-android-release with **Selected branches and tags: 1 exact ops branch**. Owner also reported disabling Admin Bypass via GitHub UI. GitHub's connector cannot read the Environment settings endpoint to independently establish the exact toggle state.
- **Denied branch test:** [Run 39234023823](https://github.com/m-as23/ICC-Reports/actions/runs/39234023823) on fix/maintrack-ruleset-qa-proof-20261019 attempted to enter maintrack-android-release with no secrets, no checkout and a step that would fail if executed. GitHub rejected the job before any steps (no job logs or executed steps). This is consistent with branch-based access denial.
- **Allowed branch test:** the existing read-only Android signing continuity job was safely re-run from the exact ops branch, [Run 39171955007](https://github.com/m-as23/ICC-Reports/actions/runs/39171955007) second attempt, and passed. It verifies the native APK signing certificate and usability of the private key **without publishing or building any APK**.
- The temporary denied-branch Workflow was deleted from the test branch after execution. No files from the test PR were merged into ops.

## Newly recognized release hazard
- Owner-installed MainTrack 0.4.4 has Android versionCode 404 and kept its session after close/reopen. A future native APK update must have code 405 or higher, same appId com.icc.maintrack, same native signing certificate.
- The Owner screenshot showed the Environment Variable **MT_ANDROID_LAST_VERSION_CODE=0**, which is outdated. Do not trust that as the last installed code.
- The file android-native-release-floor.json pins code 404 as Owner QA floor. The script native-release-floor.mjs verifies package/cert/versions and rejects a stale last-version variable, and tests are included in the QA gate.
- BEFORE a new signed native APK is produced, the Owner must update the Environment Variable MT_ANDROID_LAST_VERSION_CODE to **404**. This is safe to do later once the exact new release workflow consumes it.
- This project remains STAGING ONLY; no employee production rollout is authorized.

## Incomplete work
1. GitHub Environment reviewer requirements and GitHub Actions default token permissions still need verification and explicit owner decision. The exact GitHub Environment switch state cannot be queried through the current connector.
2. Historical repo-write workflows still exist across historical branches. Environment branch restrictions block their use of Environment secrets from other branches, but do not revoke generic GITHUB_TOKEN write permissions for any job that does not require that Environment.
3. Pin a future QA release workflow to the reviewed commit, require the Change QA combined result, and verify update metadata/valid OTA signature/expiry before any publication.
4. The Web source API URL still points at the 26-action legacy endpoint while the approved Android 0.4.4 uses the 32-action QA API; do not release mixed-source clients.
5. The Android emulator GitHub runner test has an infrastructure ADB error; real Owner device upgrade passed. Do not classify emulator run as pass.

The run evidence demonstrates effective branch access on the two tested branches, not universal resistance to malicious or administrative alteration of GitHub settings.

**No production release, database mutation, branch merge or key rotation occurred.**
