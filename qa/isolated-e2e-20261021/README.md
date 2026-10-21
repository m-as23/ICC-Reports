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

- Existing QA database: **13** `public.mt_*` tables; RLS enabled on all 13.
- Three test-role accounts (Owner, Engineer, Technician), **all inactive**; zero sessions, reports, leave requests or overtime requests.
- QA is **not** schema-equivalent to staging's 23 tables.
- Missing QA tables:
  `mt_components`, `mt_statuses`, `mt_categories`, `mt_leave_ledger`,
  `mt_notifications`, `mt_outbox`, `mt_audit`, `mt_mail_config`,
  `mt_technicians`, `mt_leave_balance_adjustments`.
- Staging/QA differences also exist in columns of `mt_reports`, `mt_leave_requests`,
  `mt_migrations`, `mt_overtime_requests`, `mt_substitute_time_ledger` and
  `mt_substitute_time_adjustments`.
- Historical one-shot full-E2E/race-runner Edge Functions are intentionally retired (HTTP 410). Do not reuse or reactivate them.
- No changes to the existing QA database or user accounts were made during this preparation step.

## Gates before connected E2E

1. Record a QA-specific schema-and-data baseline and verify an independently restorable QA snapshot.
2. Review and apply **additive QA-only** schema parity changes; never import live employee records, credentials, sessions, mail configuration, or production secrets.
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
