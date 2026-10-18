# MainTrack — Infrastructure inventory and safe cleanup assessment
Date: 2026-10-18
Status: **AUDIT ONLY — DO NOT DELETE**
Scope: GitHub, Vercel, Supabase, and unverified Firebase/legacy Google Apps Script.
No deployments, aliases, branches, Supabase functions, database rows, APKs, signing keys or OTA manifests were deleted or changed by this assessment.

## Current browser preview verified
- Vercel project: `maintrack-final-security-qa` (`prj_7l6q0Qx7vV7K5LP52MUNXjBOD3ZQ`).
- Latest READY preview deployment: `dpl_DA1z9Bt8ZcyCQHtTaUk9fvTTvQDf`, 2026-10-18T08:27:04Z.
- Internal build marker: `QA ONLY | stage22 | b8aaffb4e13269bccd18c0b6736a5fd17192e57b`.
- Public QA root `https://maintrack-final-security-qa.vercel.app` loads, but is not proven identical to latest preview.
- Latest individual deployment is under Vercel protection; an access-share link was confirmed functional on 2026-10-18 and expires 2026-10-19. Do not persist access-share tokens in the repository.
- Browser preview is for non-destructive UI testing. It is NOT the signed/released production Web or Android 0.4.4.

## Live resource inventory

### GitHub
One verified repository: `m-as23/ICC-Reports`, default branch `main`. It currently has 12 branches:
`main`;
`android/stage11-production-readiness`;
`android/stage12-secure-updates`;
`android/stage13-unified-source-ota-lab`;
`android/stage14-ota-native-lab`;
`feature/account-hours-redesign-20261017`;
`feature/maintrack-unified-four-updates-20261017`;
`fix/maintrack-pilot-session-candidate-20261018`;
`fix/stage14-pilot-session-20261018`;
`release/maintrack-stage22-044-integration`;
`release/maintrack-stage22-gated-20261018`;
`release/maintrack-stage22-web-android-20261018`.

No GitHub Releases were returned, but signed Android LAB 0.4.3 is hosted via immutable `updates/android/maintrack-0.4.3.zip` and manifest on the Stage14 branch. **Do not delete that branch, manifest, ZIP or historical signed bundles while installed users depend on them.**
`main` still contains an older Google Apps Script/static frontend and must NOT be assumed to be the canonical Stage22 deploy source.

### Vercel
12 discoverable projects under team `team_gw1E3m9dOLSi9YgupIlh5Xy1`:
- `maintrack-final-security-qa` (latest Stage22 QA; KEEP).
- `maintrack-unified-operations-v5` (possible predecessor/working web; KEEP UNTIL MAPPED).
- `maintrack-pilot-icc` (pilot predecessor; KEEP UNTIL MAPPED).
- `maintrack-security-bundle-audit`.
- `maintrack-security-stage9-review`.
- `maintrack-csp-hardened-qa`.
- `maintrack-corrective-v6`.
- `maintrack-navigation-fixed-v4`.
- `maintrack-navigation-fixed-v3`.
- `maintrack-navigation-pilot-review`.
- `maintrack-stage7-app-staging`.
- `maintrack-stage6-api-staging`.

Many historical project names point to reachable Vercel aliases and have READY/production-target deployments; this does NOT establish that employees use them. Before any project deletion: map public domain, QR links, browser favorites, application API base URLs, GitHub CI references, notification web links, redirects, traffic, logs, and whether a fallback/rollback uses that project. Avoid deleting projects merely because names are old.

### Supabase
Connected project: `MainTrack-Staging` (`tdnkeskczcsukcujwinu`) in healthy state.
Six ACTIVE Edge Functions:
- `maintrack-stage6-health` v4
- `maintrack-stage6-api` v13
- `maintrack-pilot-mail-worker` v7
- `maintrack-stage9-security-api` v10 (stable legacy endpoint)
- `maintrack-unified-four-qa` v15 (Stage22 candidate)
- `maintrack-stage22-release-canary` v1 (Stage22 QA canary)

Do NOT delete database, users, reports, notification tables, mail worker, functions or Edge secrets during release preparation. The QA and stable functions share a database; separate function names do not isolate writes. Stable version v10 must remain available until authenticated compatibility gates pass and rollback is proven.

### Firebase and Google
No Firebase project was available through the current linked tool inventory and the GitHub default branch code search returned no Firebase matches. **This is not proof Firebase is unused or that there are no projects on another account.** Do not delete Firebase resources without explicit ownership and dependency audit.
Legacy Google Apps Script and Google Sheets integration existed in earlier MainTrack versions. Do not remove any live Google project/spreadsheet until source and consumer references are traced; the current Stage22 architecture primarily uses Vercel + Supabase + GitHub.

## Recommended cleanup sequence (after stable release)
1. **Freeze**: identify official employee-used Web host, exact deployed release, native APK package/certificate, OTA LAB/Production channel, API routes, data owners.
2. **Back up and label**: export configs/project IDs, verify database backups and restore path, tag tested commit references; inventory CI, domain, secrets and QR dependents. Do not expose secrets in reports.
3. **Consolidate**: choose one canonical official Web project, one QA preview project and one documented API release flow. Confirm 0.4.4 Web/API/Android gates and rollback before moving links.
4. **Quarantine old web projects**: remove from active docs/entrypoints only after traffic analysis; run a monitored deprecation period. Only then consider deleting old Vercel projects without active domains/consumers.
5. **Archive GitHub work**: use immutable tags / release artifacts, preserve linked SHA objects and OTA ZIP; delete stale branches only after review of branch diffs and explicit owner approval. Never delete repository or default branch.
6. **Remove stale Supabase functions** only after an API traffic/dependency audit, preserving email dispatch, authorization, data tables and signed release endpoints.
7. **Delete legacy data** is a separate explicit owner-approved operation with exact table/rows, export, recovery verification, and production/staging separation. Do not combine it with infrastructure cleanup.

## Current no-go for main 0.4.4 release
- True employee-used official Web origin/project not proven.
- Authenticated Owner/Engineer/Technician write and rollback acceptance pending.
- Owner-installed Android APK signing certificate for in-place native upgrade not verified.
- Signed 0.4.4 OTA ZIP and activated trusted manifest not published.
- Existing LAB release pointer remains 0.4.3.

Recommendation: **Do not delete any resource yet.** Use the latest protected Stage22 QA Web preview for UI review; complete production mapping and authenticated compatibility gates before promotion or cleanup.
