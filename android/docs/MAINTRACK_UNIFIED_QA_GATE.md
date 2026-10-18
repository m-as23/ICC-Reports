# MainTrack unified QA gate — Stage22

This is a **QA-only** automated test and build workflow, not a production release. It is configured at
`.github/workflows/maintrack-stage21-web-android-qa.yml` (legacy filename, new workflow name
**MainTrack Unified QA Gate — Web, API and Android**).

## How it runs

- On changes to the QA branch affecting the shared Web UI, approval tests, Android update client,
  Stage20/21 build scripts, test harness, relevant staged SQL, or this workflow.
- Manually via GitHub Actions > MainTrack Unified QA Gate > Run workflow (select QA branch).
- `contents: read` permissions. No publishing/deployment credentials, OTA write access,
  employee passwords or production secrets.
- Tests must pass before the job is green; do not treat an artifact as release-authorized
  just because GitHub compiled an Android Debug APK.

## Stages and evidence

| Stage | Technology | Tests / output | Writes business data? |
| --- | --- | --- | --- |
| Unit and policy | Node 22 test runner | session, Owner approval, local-work and update policy; `qa-results/unit.junit.xml` | No |
| Web UI | Playwright Chromium | Owner combined inbox, decisions/alerts, archives, cross-tab refresh and required overtime choice; `qa-results/browser.junit.xml` | No (mock API only) |
| Live QA API | Node 22 fetch | QA health, read-only DB readiness, exact Origin CORS, blocked foreign Origin and rejected unauthenticated request | No |
| Android build | Gradle/Android SDK 36 | isolated `com.icc.maintrack.stage22qa` Debug APK build | No |
| Package integrity | apksigner/aapt and Python ZIP verification | version, package ID, debug certificate, shared frontend JS equality, no stable API URLs in QA files | No |
| QA summary | Node 22 | fail-closed `qa-summary.json`, `qa-summary.md`, GitHub Job Summary | No |

The artifacts retained for 14 days are:
- `MainTrack-Stage21-Coordinated-QA-Only` (historical artifact name): QA Web ZIP,
  separate Debug APK, identity/hash manifest. Available only if build and checks complete.
- `MainTrack-Stage22-QA-Gate-Report`: JUnit XML plus machine-readable and human-readable
  gate result, uploaded even if an earlier test fails.

## Exact scope and limits

- All Playwright API responses are **synthetic**. No staff account is used and no real leave,
  overtime or work-order decision is performed by these tests.
- Live API smoke is against `maintrack-unified-four-qa` **only**, with an exact known Vercel
  QA Origin; it does not exercise a successful authenticated login or modify Supabase.
- The QA Edge function and stable Edge function share one Supabase project/database.
  Avoid writing disposable QA records to the shared database.
- The QA APK is a **different package**, signed with an ephemeral Debug key. It is **not**
  an upgrade of the currently installed MainTrack Android app and does not validate OTA
  key continuity, native rollback, session preservation or offline report-queue durability.
- The existing Stage14/15 physical-device compatibility and owner-signed OTA release gates
  remain open. Passing this workflow **does not** promote the stable API, deploy to
  Vercel Production, change a manifest, or approve a production rollout.
- A separate protected GitHub production release workflow/environment is necessary for a
  technical block on unauthorized production publishing. This QA job returns a failing status
  on failure, but does not in itself enforce protection on unrelated workflows.

## Diagnostic workflow

1. Open the GitHub Actions run and examine the first failing step.
2. Download `MainTrack-Stage22-QA-Gate-Report`; read `qa-summary.md` and JUnit XML.
3. Fix only on the QA branch, then let GitHub rerun the affected gate.
4. After a clean gate, do *one* physical Android smoke on the side-by-side Stage22 QA app.
5. For a future production rollout, separately verify stable-backend backward compatibility,
   a signed compatible OTA using the installed trust key, unsent-local-work safety, and
   rollback on the same immutable bytes. Obtain explicit Owner approval.

This test system intentionally minimizes repeated full Android emulator runs. A full native
emulator + in-place update test is a separate, opt-in release-acceptance check, not performed by
this lightweight daily QA gate.
