# MainTrack — Staging-first development decision (19 October 2026)

**Owner-approved decision:** Continue development and repeated QA on the **existing Supabase project** `MainTrack-Staging` (`tdnkeskczcsukcujwinu`). **Do not create a second Supabase project, organization, or production database now.** Establish a separate production environment only when Owner requests final rollout.

## Release terminology — do not confuse these states
- `0.4.4`: Owner device QA reference, signed Android app, installed successfully over 0.4.1. Report creation/deletion, section creation, and persisted login after app close/reopen were reported PASS on the real Owner device.
- `Staging QA`: existing Supabase project, may hold test or historic data. It must not be treated as production or emptied automatically.
- `Employee Production`: **NOT RELEASED**, all existing production release blocks remain active. No new users or employee migration is authorized by this decision.
- `Full staging integration`: a new feature may require changes to existing data/API. Do not deploy such changes automatically, even if CI passes; design migration/backup and await Owner approval.

## One update process, adaptable to feature type
1. Work from the last reviewed source baseline on a `feature/*` or `fix/*` branch. Protect the prior working code; do not edit the frozen baseline.
2. Submit changes for review against `ops/maintrack-044-production-foundation-20261018`. The `MainTrack — Change QA Gate` workflow tests and classifies the change as Web / Android native / API / DB / update infrastructure, using only the same current Staging environment for explicitly read-only live tests.
3. Any source change must run all maintained unit tests (session, OTA, saved edits, offline queue, API and role regression) plus Python release checks. A QA build must be verified from the **exact reviewed commit**, not a moving branch or stored artifact from an unrelated commit.
4. For Web changes, build a QA preview with fixed source SHA; test login, Dashboard, Reports, Work Orders, approvals, notifications, and mobile layout.
5. For Android native changes, build APK with **same package and certificate**, strictly increasing `versionCode`, and try installing over the approved version without uninstall; for HTML/JS changes use signed OTA only if native compatibility and local data allow it. OTA signature is a different key from Android APK signing.
6. Any DB/API change must include explicit compatibility checks for the 32 actions, RBAC of owner/engineer/technician, no destructive migrations, backup/restore plan and Owner approval **before any Staging mutation**.
7. Confirm change-specific tests and QA smoke (including session persistence) on Owner device; do not require Owner to repeat unrelated long Android tests.
8. Only after Owner explicitly approves **that exact release**, use the configured QA/LAB channel and record the SHA, APK/OTA hashes, certificate, API version, deployment and rollback/roll-forward plan.

## Stop conditions
- CI failed/skipped, unknown signing key, unmatched Android package, downgraded versionCode.
- Session lost unexpectedly, unsent report queue at risk, corrupted local data or undefined migration.
- Web and APK call different API contracts, lost authorization controls, or staging schema is unexpectedly changed.
- Signed OTA manifest expired or doesn't support the installed native version.
- No review of previous source, unclear build provenance or unapproved remote production/staging deployment.

## Important limitations
- A green CI workflow is **not** a guarantee of bug-free future software. It is evidence for named tests only. Real-device smoke and incremental rollout remain necessary.
- GitHub branch protection/rulesets do not currently have verified enforcement through this connector. A read-only workflow alone cannot prevent a collaborator with write permissions from using another workflow or pushing directly. Branch protection and restricting old publishing workflows remain a separate security control to configure explicitly.
- Vercel Production and separate Supabase Production must remain unused until Owner requests final release; security of existing Staging does not imply production-grade isolation.
- Do not delete old GitHub branches/workflows, OTA archives, signing secrets, historical deployments or Staging records as part of this setup.
