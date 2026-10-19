# MainTrack — GitHub security hardening: one-time owner/admin controls
**19 October 2026 — pending Owner UI actions.** No Production or employee deployment is authorized.

## Verified findings
- Repository: https://github.com/m-as23/ICC-Reports — default branch main, currently **PUBLIC**. GitHub API returns admin permission, but branch-protection endpoint returns 403 Resource not accessible by integration. No effective GitHub rulesets were returned (empty list).
- Current development branch: ops/maintrack-044-production-foundation-20261018. Frozen reference: baseline/maintrack-v0.4.4-owner-verified-20261018.
- main contains legacy application code; do not deploy directly from it.
- Historical GitHub Actions workflows have contents:write and Android/OTA signing secret access; branch restrictions alone do not enforce the new release approval policy.
- maintrack-android-release is the existing Android signing-secret environment. Do not expose or copy keystore/private keys/passwords.
- Read-only audit-release-workflows.mjs is linked to canonical QA; it detects unexpected privilege changes but cannot prevent legacy-branch or UI bypass.

## One-time GitHub settings — action required from Owner
1. Open https://github.com/m-as23/ICC-Reports/settings/rules while signed in as repository administrator.
2. Create an ACTIVE branch ruleset named MainTrack Reviewed Changes, target only ops/maintrack-044-production-foundation-20261018.
   - Require pull request to merge; require status check **MainTrack Staging-only QA — required combined result**, which is the overall-qa job on pull_request.
   - Disallow force pushes and branch deletion. Keep the branch up-to-date with the checked PR where feasible.
   - Do not give broad bypasses. If Owner is the only maintainer, avoid requiring a separate approval that cannot be supplied; publication approval remains separate.
   - After saving, VERIFY by opening a harmless PR: a failing QA must block merge. A saved ruleset is not necessarily an enforced one.
3. Create a second ACTIVE ruleset named MainTrack Freeze 0.4.4 Baseline targeting baseline/maintrack-v0.4.4-owner-verified-20261018. Restrict updates, deletion and force pushes.
4. Protect main from force pushes and unreviewed changes too, but keep it NON-DEPLOYABLE: legacy source.
5. Open https://github.com/m-as23/ICC-Reports/settings/environments and select maintrack-android-release.
   - Limit Deployment branches to exact reviewed ops branch and any one subsequently approved release branch. Do NOT use broad release/* pattern because historical release branches still exist.
   - Turn on required reviewer approval if your GitHub plan permits. Another trusted maintainer is preferred for independent approval; sole-Owner review is not independent.
   - Keep MT_ANDROID_* keystore credentials and MT_OTA_* private signing key as Environment secrets ONLY, not repo-wide or organization secrets.
   - Confirm any QA signing job that intentionally needs the environment still operates only after requested approval.
6. Under Settings → Actions → General set the default GITHUB_TOKEN permission to read-only; grant contents:write only in specific reviewed release jobs as needed.
7. Share screenshots of the Rulesets and Environment branch/reviewer settings to confirm, but never reveal secrets.

## Visibility and OTA risk
The repo is currently PUBLIC. That does not automatically expose Supabase rows (RLS still applies), but it means tracked code is world-readable. Check company confidentiality requirements.
**Do not change this repo to PRIVATE immediately:** existing Android APKs fetch signed OTA files from public raw.githubusercontent.com URLs. A privacy change may break updates. Move verified OTA hosting first, then re-check signed manifest/retrieval on an installed device before modifying visibility.

## Remaining blockers
- Rulesets/Environment restrictions unverified; GitHub connector cannot modify branch protection directly.
- Existing historic write-capable workflows not retired/disabled administratively. No deletion until OTA dependency audit.
- Canonical Web source still points to legacy 26-action API, whereas Owner Android QA 0.4.4 uses 32-action QA backend. Do not publish mixed sources.
- Owner must approve exact reviewed commit, version and risk after QA, before any OTA/APK/Web release.
- Signed 0.4.4 LAB manifest expires 2026-10-24; expired policy must not be reused or bypassed.
- No employee production release is authorized.

State: **HARDENING IN PROGRESS — NO PRODUCTION PUBLISH**.
