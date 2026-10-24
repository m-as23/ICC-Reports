# MainTrack 0.4.7 Final — release verification checkpoint

Date: 2026-10-24 (Africa/Cairo)
Candidate tested: `507cc40bb14680981843ddbf52aee81f609acb0d`
Branch: `fix/maintrack-047-inventory-cache-numerals-20261024`

## Accepted launch intent

The Owner accepted the cache/numerals device preview and confirmed existing users,
reports and other application data are disposable test data. 0.4.7 Final is the
first supported operational release. Earlier experimental clients must lose
service access at cutover. This test checkpoint does not execute database deletion,
revoke sessions, publish OTA, move Web aliases, or merge a release.

## Fresh automated evidence

| Suite | Passed | Failed | Scope |
| --- | ---: | ---: | --- |
| Inventory/frontend/reference-search/mail | 30 | 0 | Actual candidate modules |
| Team ledger/API/workflow | 18 | 0 | Disposable PGlite database |
| Release identity, version floor, Web/native parity | 19 | 0 | Candidate packaging and tamper rejection |
| Native/session/update behavior | 107 | 0 | Candidate tests excluding two historical source-lock checks |
| Inventory backend/import/auth/search | 88 | 0 | Synthetic data; no cloud writes |
| Actual candidate browser flows | 33 | 0 | Chromium 133, mobile/desktop viewports, synthetic closed transport |
| Historical source-lock checks | 2 | 0 | Immutable 0.4.6 commit `1248211b662981e3e7db27ac0a61ca4d23862ca1` |

Candidate source attestation and 047 static checks also exited successfully.
The existing read-only live Staging smoke also passed: service health, database
readiness, allowed browser preflight, unauthenticated rejection and untrusted
Origin rejection. This probes the historical allowed Stage22 Origin; it does not
prove the eventual Final Web origin or authenticated user journeys.
Logs: `audit-output/final-adoption-{focused,ledger,release,native-behavior,backend-complete,browser-complete,legacy-source,attestation,static}.log`.

Browser checks cover navigation retaining the inventory iframe/query/results,
disk restoration offline, generation changes, logout/account isolation, denied
sessions, unavailable/corrupt storage, interrupted refresh, real worker cancellation,
literal/semantic search, role menus, responsive ledger/numerals and mobile save clearance.
Synthetic warm-return measurement: 114 ms including automation; not a handset SLA.

## Test setup failures and resolution

- Running the complete historical native suite on 047 produced 108 passes and one
  source-lock failure: that test requires exact older UI blobs. The existing CI
  explicitly runs this historical gate on the pinned 046 commit. Both historical
  checks passed on that commit; 107 remaining behavior checks passed on the actual
  candidate. No source lock or assertion was weakened. The actual 047 parity and
  source attestation checks passed separately.
- Initial backend run lacked installed `exceljs`; installed the existing locked
  dependencies with `npm ci --ignore-scripts`, then reran all backend unit tests:
  88 passed. No dependency manifest/lock changed.
- Initial full-host browser run lacked its generated synthetic review directory.
  Generated the review from current assets with the existing `prepareReview`
  script and supplied `TEAM_LEDGER_REVIEW_DIR`; the complete rerun passed 33/33.

## Existing GitHub evidence rechecked

The nine check runs attached to candidate SHA were `completed/success` when
queried, including actual candidate Chromium, disposable PostgreSQL contracts,
the combined QA gate and isolated preview APK build.

- https://github.com/m-as23/ICC-Reports/actions/runs/40095553311
- https://github.com/m-as23/ICC-Reports/actions/runs/40095553310
- https://github.com/m-as23/ICC-Reports/actions/runs/40095553335

The legacy CI jobs exercise the pinned 046 baseline; they must not be described as
full end-to-end 047 release proof. Candidate-specific 047 jobs provide separate evidence.

## Release verdict: Not ready for operational cutover

No defect was reproduced in the completed candidate suites, and the Owner reports
the device preview satisfactory. Two release requirements remain unverified:

1. **Final distribution identity:** the installed cache preview has a separate
   package ID and temporary QA signer. Produce and verify the final original-package
   APK with the existing Owner signing identity; verify the Web/OTA/native release
   routing and actual upgrade. Preview success is not proof of an original-package
   upgrade. Existing employee-release state is still prelaunch-blocked.
2. **Old-client service retirement:** no proven 047 minimum-client enforcement was
   found in the reviewed API/session path. It currently authenticates account and
   session, which does not distinguish an old binary using new credentials.
   Resetting test users/sessions alone does not meet the retirement requirement.
   Inventory all historical service endpoints and retire their access as part of
   a reviewed cutover. A client-reported version or browser Origin alone is not
   authentication of a binary.

Before cutover, prove both a pre-047 client cannot authenticate/write and the final
047 client can complete approved report/leave/overtime/approval flows on the intended
fresh environment. Scope test-data deletion explicitly, including preservation of
the Owner bootstrap path and required configuration. No cloud data was deleted here.
