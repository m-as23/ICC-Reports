# MainTrack — Full Isolated Schema Parity + Persisted E2E Acceptance
**Date:** 2026-10-20
**Decision:** **QA FUNCTIONAL E2E PASS** for tested flows; **PRODUCTION / EMPLOYEE RELEASE NO-GO**.

## Isolation and reconstruction
- Dedicated Supabase project: `MainTrack-RBAC-QA-Isolated`, ref `szhstrafzkxzstjdcynl`.
- Original employee Staging project `tdnkeskczcsukcujwinu`: **READ ONLY** for catalog introspection; verified after the tests, 15 users and 124 reports as before; the three previous `QA_RBAC_*` accounts are still inactive.
- Created a **new private `qa_full` schema** in the isolated project, preserving the pre-existing 13-table public RBAC QA fixture and its earlier acceptance records.
- All 23 tables were rebuilt as empty tables from the original Staging **schema metadata only**; no row, employee password, report, user ID, email recipient or account secret was copied.
- Reproducible DDL review artifact: `ops/maintrack/qa-full-schema-only.sql`. **Never execute it on Production or employee Staging.**
- Three synthetic E2E users, one QA section, one QA machine, one QA component, statuses, category and 28-day synthetic balances were seeded solely into `qa_full`.

## Catalog-level parity — exact comparison
| Object | Original Staging | Isolated qa_full | Differences |
|---|---:|---:|---:|
| Tables | 23 | 23 | 0 |
| Columns (names, types, defaults, nullability, identity) | 180 | 180 | 0 |
| Constraints (names, definitions) | 105 | 105 | 0 |
| Total indexes incl. PK/unique | 79 | 79 | 0 |
| Functions (names + SECURITY DEFINER flag) | 3 | 3 | 0 |
| User-defined Triggers (names/table) | 3 | 3 | 0 |
| Report-sheet View | 1 | 1 | QA view deliberately uses `security_invoker=true` |
| Sequences incl. identities | 8 | 8 | No original sequence counter values migrated |
| RLS-enabled public-equivalent QA tables | 23 | 23 | 0 |

Function bodies were schema-scoped from `public.mt_*` to `qa_full.mt_*`; all direct `anon`/`authenticated` table grants and schema USAGE rights are revoked. QA function EXECUTE rights are revoked. No public RLS policies are opened to make the tests pass. No external email configuration was enabled.

## Persisted real E2E — PASS
A single-use, guarded, server-to-server copy of the **actual 32-action MainTrack Backend**, originally `maintrack-unified-four-qa` v15, ran with PostgreSQL `search_path=qa_full,public,extensions`. The internal one-shot runner used randomly generated passwords and verified actual HTTP responses + database rows, not mocked browser responses.

The Postgres terminal marker **`QA_E2E_PASS`** was reached only after all asserted scenarios succeeded:
- Real Owner/Engineer/Technician password login, session identity and authorization; technician/engineer forbidden from Owner-only endpoints.
- Engineer report POST saved **one** work order, replay returned a duplicate result without a second row, same client ID with conflicting payload returned HTTP 409.
- Dashboard correctly included the synthetic report, month filtering worked, and Technician received only restricted analytics.
- Report notification was persisted; read status propagated across two independent Engineer login sessions.
- Annual leave request, Owner approval, repeat approval idempotency, rejected second request and balance ledger: **28 → 27 days**.
- Completed 4h substitute overtime: Owner approval creates **240 minute substitute ledger = 0.5 day**.
- Completed 8h financial overtime: Owner approval leaves substitute ledger unaffected while financial-equivalent total records one day; annual balance stays 27.
- Owner leave/overtime inboxes, audit events, stored notifications and email outbox transaction behavior were checked.
- No outbound email was sent: **0 enabled mail settings**; an outbox row is an internal DB queue record only.

### Final independently read data state
`qa_full.mt_migrations = QA_E2E_PASS`; **1 report**, **2 leaves** (1 APPROVED, 1 REJECTED), **2 overtime** (SUBSTITUTE and FINANCIAL, both APPROVED), **1 leave-ledger entry**, **240 substitute minutes**, **27 remaining Engineer annual days**, **5 notifications**, **9 audit records**, **1 unprocessed internal outbox row**, **0 sessions**, **0 enabled email config** and all three synthetic E2E user accounts **inactive**. All of these are synthetic artifacts isolated in `qa_full`.

Both temporary functions `maintrack-full-e2e-temporary` and `maintrack-full-e2e-runner-once` were replaced by safe HTTP 410 handlers, using `verify_jwt=true`; they contain no runnable test implementation or temporary challenge. Their old test sessions were deleted and all passwords rotated to new unrecoverable hashes.

## Security and performance advisor findings
- Security Advisor: 36 informational `rls_enabled_no_policy` findings across both QA schemas; intentional deny-all access with grants revoked. Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Performance Advisor: 5 informational unindexed foreign keys and 26 unused indexes (many are new QA indexes that have not yet had workload). These are advisory only; do not change Production indexes based on the small QA workload. Docs: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Remaining barriers to employee-release authorization
This evidence **does not** show a successful QA database BACKUP+RESTORE, concurrent competing approvals, full CMMS report edit/delete transaction flows, real Android upgrade/signature/OTA rollback on device, complete network/mobile offline cross-device update with real backend, or a protected Production database and Web endpoint rollout.

The canonical Web bundle still embeds the legacy 26-action endpoint instead of a reviewed stable 32-action Production API. Employee release JSON remains `PRELAUNCH_BLOCKED`; **do not merge** QA PR #19/#20 into Production/main or deploy signed APK, Web or OTA without independent owner authorization.

## Next safe QA milestones
1. Test full-schema **backup and restore** to a disposable QA target and verify constraints, sequences, RLS, triggers, grants and a synthetic report checksum.
2. Run concurrent Owner approvals, race conditions, pending balance reservations, two devices with real backend notifications and CMMS edit/delete, preferably from protected CI on a dedicated isolated database.
3. Reconcile all 32-action Web + Android release candidates to a version-pinned API and prove offline/OTA native device update + rollback without losing local work.
4. Only after these, review a new release candidate with exact SHA, immutable artifacts, protected environment and explicit Owner approval.

**Evidence references:** Original `ops/maintrack/FUNCTIONAL_QA_GO_NO_GO_20261020.md`, RBAC `ops/maintrack/AUTHENTICATED_RBAC_QA.md`, and QA CI https://github.com/m-as23/ICC-Reports/actions/runs/39380863534. The CI run is for browser and static/source security tests; the authenticated live E2E above was independently executed through temporary isolated Supabase Edge Functions.
