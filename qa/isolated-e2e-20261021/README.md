# MainTrack — Isolated E2E QA preparation (2026-10-21)

**State: PREPARATION ONLY. Not yet an approved end-to-end environment.**

## Scope and identity

- GitHub source: `ec2e4dcdd3e862f0efcb3f716ec2948fe93e338f` (QA baseline).
- QA GitHub branch: `qa/maintrack-isolated-e2e-20261021`. Do not merge into `main`, `ops/` or release branches.
- **Only permitted backend target**: existing Supabase project `MainTrack-RBAC-QA-Isolated`, ref `szhstrafzkxzstjdcynl`.
- The staging backend `tdnkeskczcsukcujwinu` must NEVER receive synthetic writes.
- Production must NEVER receive tests, migrations, test users, or deployments.
- There is no approved rollout, OTA publication or signing-key change.

## Read-only baseline recorded on 2026-10-21

- The QA project's **public** RBAC fixture has 13 `mt_*` tables (RLS enabled on all 13). The separate **`qa_full` schema has all 23 application tables**, with the same table/column names as staging's `public` schema, RLS on all 23, 28 valid foreign keys and three enabled application triggers.
- Three test-role accounts (Owner, Engineer, Technician), **all inactive**; zero sessions, reports, leave requests or overtime requests.
- Schema parity **PASS for `qa_full`** (23 of 23 tables; exact column-name coverage). Do not mistake the limited legacy `public` RBAC fixture for `qa_full`.
- Two additional preserved QA schemas, `qa_offsite` and `qa_restore`, each have 23 tables, RLS on 23, 28 valid foreign keys and three enabled application triggers.
- `qa_full` currently contains three `QA*` accounts, all **inactive**; zero sessions, one test report, two leave requests, two overtime requests, five notifications and one outbox record. Mail-config table is empty. This is preexisting synthetic fixture data; do not delete or silently reactivate it.
- **OUTBOX SAFETY BLOCKER**: the single existing `qa_full.mt_outbox` record is in `PENDING` or `PROCESSING`. Do not start a worker, dispatch external notifications or live emails. Test mail must be sinked/disabled and the pre-existing queue reviewed before any E2E writes.
- Historical one-shot full-E2E/race-runner Edge Functions are intentionally retired (HTTP 410). Do not reuse or reactivate them.
- No changes to the existing QA database or user accounts were made during this preparation step.

## Gates before connected E2E

1. Record a QA-specific schema-and-data baseline and verify an independently restorable QA snapshot.
2. Verify and preserve `qa_full` schema parity; **no schema migration is currently required for table/column-name parity**. Verify exact column types, constraints, permissions and trigger/functions separately before any authenticated test. Never import live employee data or secrets.
3. Provision disposable QA-only accounts for each role with independently generated credentials; verify login lockout, permissions, and session expiration. Never share passwords via Git or logs.
4. Build a QA-only API endpoint with explicit project-ID validation, strict test-only identity restrictions, and separate mail/outbox sandbox or disabled external delivery.
5. Run synthetic local unit, Chromium, API-denial and mobile session/OTA checks.
6. Execute approved **live QA-only** cycles: report create/read/update/soft-delete; leave request and approve/reject; cash vs substitute overtime; balance ledgers, notifications/read-sync; Owner/Engineer/Technician RBAC; idempotency; error/retry/race; audit/history.
7. Verify post-run state and clean up only designated test records with explicit approval. Never blindly reset or truncate.
8. Physical installed Android app upgrade/OTA/signing compatibility remains a separate release gate.

## Non-negotiable safety

- No production or staging writes.
- No mass imports, destructive migrations or real employee fixtures.
- No live mail/SMS/push delivery to employees.
- No release publishing, no signing secrets, no background runner reactivation.
- Any unexpected project identity, missing schema, or unsafe network target is **STOP / NO-GO**.
- G1 encrypted backup and scoped restore checkpoint remains untouched.

Run `node qa/isolated-e2e-20261021/preflight.mjs` from repository root for a local, offline preparation-only check. A passing preflight is **not** an E2E PASS.
