# MainTrack — Full Functional QA: decision report

> **2026-10-20 status update:** The former 13-table schema blocker and persisted E2E blocker in this original report have since been resolved in an isolated private `qa_full` schema. Verified 23-table catalog parity and real report/leave/overtime/notification/database acceptance are documented in [FULL_SCHEMA_E2E_ACCEPTANCE_20261020.md](FULL_SCHEMA_E2E_ACCEPTANCE_20261020.md). The remaining release decision is still **NO-GO** due backup/restore, concurrency/device, canonical Web/API parity and protected Production rollout gates. This earlier report is preserved as a historical test stage, not a statement of current QA readiness.

**Date:** 2026-10-20
**Decision:** **NO-GO for Production and employee release**. **PASS for the scope of safe QA run here.**

## Evidence — actual tests completed
| Scope | Method | Actual result |
|---|---|---|
| Backend field validation, cross-midnight time, Cairo overtime, dashboard role filtering, notification 5-item cap, permission enforcement, CMMS bounds | Execute original backend functions inside a Node VM with synthetic query rows | **13/13 PASS** |
| 32-action access denied, forbidden browser Origin, invalid bearer, non-QA login | POST/GET against actual dedicated isolated Supabase Edge Function, without credentials or writes | **39/39 PASS** |
| Local report persistence protection / OTA update activation / browser role menus | Chromium tests against actual generated Web candidate; network intercepted | **26/26 PASS** (previous suite) |
| My Account, overtime compensation, mixed Owner inbox, approve/reject archive, notification badge, history filters, two-tab sync | Seven additional Chromium scenarios with an in-memory fake server | **7/7 PASS** |
| Combined Gate (session/OTA/API/Chromium) | GitHub Actions on branch | **4/4 jobs SUCCESS** |
| Employee release boundary | Run existing `employee-release-gate.mjs --assert-blocked` | **PASS: rollout remains BLOCKED** |

**CI run for current tests:** https://github.com/m-as23/ICC-Reports/actions/runs/39380557566
**Prior authenticated RBAC proof:** `ops/maintrack/AUTHENTICATED_RBAC_QA.md`, 18 authenticated read checks + 9 denial checks and three real password logins. Current tests did not reuse credentials.

## Actual isolated data state after the run
- QA-only project: `szhstrafzkxzstjdcynl`, separate from employee Staging `tdnkeskczcsukcujwinu`.
- **13/13 RLS-enabled** tables; all three synthetic accounts **inactive**.
- **0** sessions, **0** reports, **0** leave requests, **0** overtime requests in isolated QA.
- No live mutation workflow was executed. This is intentional: the isolated DB is a **minimal 13-table fixture**.
- No Production Vercel deploy, APK build/sign/install, OTA publish, main merge or employee credential changes.

## What cannot yet be marked PASS
| Release gate | Status | Required acceptance |
|---|---|---|
| Full application schema (real app has 23 tables; isolated QA fixture has 13) | **NOT READY** | Rebuild actual full schema using reviewed migrations / DDL in a separate QA database, with zero copied production/employee rows |
| Persisted report lifecycle and idempotency (including edit/delete and CMMS) | **NOT TESTED END TO END** | Real API create/read/edit/delete/duplicate tests, audit and notification checks with synthetic records |
| Leave approval/rejection, annual and substitute-day debit, negative balance protection | **NOT TESTED END TO END** | Request → Owner decision → ledger → balance → history, including two concurrent requests |
| Overtime financial versus substitute-hours conversion (8h=1 day; 4h=0.5), shifts and overnight | **NOT TESTED END TO END** | Real DB ledger assertions, no double approval, and workKind rules |
| Notification durability and read sync between devices | **BROWSER MOCK PASS ONLY** | Real DB session A/B read/mark/read assertions with employee-independent QA identities |
| Database backup and actual restore | **NOT VERIFIED** | Tested restore of isolated full-schema database including sequences, functions, triggers, policies, views and privileges |
| Canonical Web/API parity | **BLOCKED** | Canonical Web JS still embeds legacy 26-action Stage9 URL while required contract has 32 actions; prepare reviewed 32-action compatible deployment |
| Native APK upgrade, installed certificate, OTA rollback, offline queue on owner device | **CI/MOCK PASS ONLY** | Safe signed owner-device 405+ acceptance with immutable identity, backup, roll-forward and rollback; separate human approval |
| Production isolation, stable Vercel deploy, canary and owner approval | **NOT READY** | Provision/validate Production target only with explicit approval, restore evidence, environment protection, canary monitoring |

The repository's `ops/maintrack/employee-release-gates.json` is `PRELAUNCH_BLOCKED` with **all ten mandatory employee release gates still pending**. The CI gate must not turn these into verified statuses on the strength of mocked/browser/source tests.

## Recommended next decision sequence
1. **First fix testability, not Production:** Prepare a FULL, isolated 23-table QA schema from reviewed database migrations/schema-only metadata; seed only synthetic equipment, reports, employees and balances. Keep external email delivery and update publishing disabled.
2. Run persisted real API E2E scenarios for reports, leave, overtime, approvals, idempotency, concurrency, notifications and filter-based analytics. The automated test must show before/after DB invariants and clean up test rows.
3. Verify complete backup/restore for a throwaway QA schema, and reconcile all 32 API paths (including old 26 behavior) across Web+native clients.
4. Re-run all QA gates on the exact release-candidate SHA; complete signed owner-device tests, rollback, then ask for release/canary approval.
5. Never merge this branch or PRs #19/#20 to `main` or Production automatically.

**Precise interpretation:** green **QA** means the checks actually performed passed; it does **not** certify the entire MainTrack application, persisted workflows, or any Production release.
