# Approved inventory responsiveness rollout

User authorized adopting the previously measured worker preparation in the existing 047 staging web and isolated APK. Scope: loading responsiveness only; retain search algorithms, original HTML/CSS, Owner last-three versions, backend and stock data. No local AI model, schema change, production deployment, or employee rollout.

1. Promote the proven cancellation-safe loader and static worker to frontend assets. Bind jobs to an opaque account context, terminate workers on cancellation/timeout, and reject changed approved versions before commit. Tests: account/load races, failure/retry, actual worker equivalence and interruption.
2. Regenerate reproducibly from locked reference engine; update current 047 asset hashes and parity tests. Run existing full UI/role/search regressions and independent whole-change review.
3. Publish reviewed feature source, run CI and build a new isolated Preview 7 APK (ephemeral signing cannot update Preview 6). Deploy staging web and check served hashes, CSP and API origin. Report only verified adoption; never claim physical handset tests.

Acceptance: responsiveness rather than shorter cold readiness. Prior honest Chromium median: 621.7→38.4 ms main-thread heartbeat gap; readiness 797.6→1024.4 ms. User accepted this tradeoff. Additional version validation is one read per snapshot, no polling or writes.

## Verified implementation
- Node frontend/parity/search/mail: 20/20; backend regression: 88/88.
- Actual UI/browser role/search: 5/5; high-volume loading/error/race tests: 9/9; other navigation/mobile/inventory suites: 3/3. Desktop Chromium at mobile/desktop viewports, not a physical handset.
- Independent whole-change review: no Critical/Important findings. Treated interrupted back-forward restoration as a release-blocking usability defect: regression failed with 0/3920 rows before fix, then passed with pageshow persisted reload. All nine loading scenarios passed afterward.
- Locked reference JS and CSS unchanged. No model, API handler, schema, stock row, provider setting or original app signing key changed.
