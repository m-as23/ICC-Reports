# MainTrack — Two-Supabase-Project Safe Pilot Plan

**Date:** 2026-10-20  
**Decision:** Work with the two existing no-extra-cost projects; **DEFER a third Supabase Production project**. This does not authorize any employee release or relabel the existing Staging project as production-grade.

## User-approved resource constraint

The user cannot provision a third Supabase project or upgrade solely for this purpose. Two projects already exist:

| Resource | Reference | Authorized use |
| --- | --- | --- |
| MainTrack-Staging | `tdnkeskczcsukcujwinu` | Continue hosting the current operational/pilot build and employee-like data; do **not** run destructive tests or full-schema reseeds |
| MainTrack-RBAC-QA-Isolated | `szhstrafzkxzstjdcynl` | Continue all automated functional and security tests with synthetic test data only |
| MainTrack-Production | Not created | **Indefinitely deferred** unless circumstances change; do not pause or delete either existing project to create it |

Vercel and GitHub can host code artifacts; they do not remove the actual database segregation limitation. Using an extra schema within Staging is not a third independent project and cannot satisfy an independent production-isolation requirement.

## Safe, no-cost sequence (no work on active DB)

1. Maintain the existing Staging application unchanged during QA. Use the isolated QA project for actual persisted E2E, concurrency, roles, notification and synthetic data tests; keep all temporary runners disabled.
2. Before any modification to Staging, establish a **restorable encrypted backup of real Staging data**, with an agreed retention policy and isolated recovery verification. The current 19-table sanitized GitHub artifact contains ONLY synthetic QA records and is **not** a backup of Staging employees or reports. Never put real employee exports in GitHub, issue logs, public artifacts or the isolated QA project without authorized safeguards.
3. Complete a 32-action API compatibility review. The currently served canonical Web bundle still points to Stage9 (26 actions); the QA-only rewritten client references the 32-action backend in Staging but is **not approved for production/employee rollout**. Ensure the same real sessions, origin allowlist, roles, endpoints, app ID and upgrade/rollback contracts are preserved; prove this before any future release.
4. Confirm same-signer Android APK test on the owner's actual device after the existing package backup and unsent-report data retention checks, with no forced uninstall or downgrade. Programmatic OTA rollback simulation is not a physical native APK rollback.
5. Define a separately controlled **limited owner/pilot-only release request**, with a fixed cohort, release-candidate commit/manifest and signoff. Review backup, data compatibility, rollback, monitoring and error criteria; no automatic deployment, migration, employee enablement or OTA publication.
6. Continue using current Staging for bounded pilot operation only **after explicit Owner approval**. Reassess capacity/security before wider employee adoption. When a genuinely independent Production becomes possible, use a fresh backed-up migration process and a new explicit deployment approval.

## Distinct release semantics

- `ops/maintrack/employee-release-gates.json` remains `PRELAUNCH_BLOCKED` and its 10 mandatory production release gates stay `pending`; do not silently waive or reinterpret the isolated-production-db requirement.
- New `ops/maintrack/pilot/two-project-safe-pilot-policy.json` governs a distinct, currently **BLOCKED** path for limited testing under the two-project constraint. All six pre-deployment pilot requirements remain pending, and all automatic release/staging-write switches are `false`.
- `ops/maintrack/production/001-private-schema-LOCKED.sql` and `prepare-locked-api.mjs` are preserved as future-ready **nondeployed artifacts**, not a requirement for continuing QA. Their hard startup lock remains intact.
- Do not confuse "Staging used temporarily by real employees" with "an independently isolated Production environment." Never point employee Web/API traffic at the synthetic QA DB.

## Next executable QA actions under this plan

- Run the exact-commit GitHub QA CI and negative authorization tests, synthetic transactional E2E and recovery tests.
- Audit current staging backup availability and Vercel release protections via **read-only** tools, without exporting private employee data.
- Prepare read-only Android APK signature/version preflight and document safe owner-device acceptance.
- Do not request another Supabase project, approve subscription charges, turn off either project, or merge Draft PRs to live branches.

**Current decision: NO-GO for employee-wide rollout, no Production deployment authorized, existing MainTrack unchanged.**
