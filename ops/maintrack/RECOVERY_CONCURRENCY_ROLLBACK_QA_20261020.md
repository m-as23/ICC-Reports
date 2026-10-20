# MainTrack — Isolated Recovery, Race Conditions & Rollback QA

**Date:** 2026-10-20  
**Environment:** Supabase isolated QA project `szhstrafzkxzstjdcynl` only.  
**Decision:** QA tests in this document PASS for their exact scope. **Production and employee rollout: NO-GO.**

## 1. Database-local recovery rehearsal — PASS

- Using `ops/maintrack/qa-full-schema-only.sql` from this branch, reconstructed a separate private `qa_restore` schema in the isolated QA project, rather than modifying `qa_full` or live employee Staging.
- Restored all **23 QA tables** in a single PostgreSQL repeatable-read transaction, using foreign-key dependency order. Identity values and all **8 sequences** were restored, and user triggers were disabled **on the recovery target only** during row copy, then re-enabled.
- The first attempt failed because PostgreSQL enum types are schema-specific; the transaction rolled back without residual target rows. Repeated with explicit JSON-record-to-target-type conversion; this succeeded.
- Verified each of the **23 tables individually** by row count and sorted JSON row MD5 digest, and compared the actual restored Postgres catalog to baseline.
- Recovery target: **23 tables / 180 columns / 105 constraints / 79 indexes / 3 triggers / 3 functions / 1 view / 8 sequences**; **23 RLS-enabled tables** and no `anon` or `authenticated` schema USAGE grants.
- Recovered **3 synthetic users, 1 report, 2 leave requests and 2 overtime requests**, with zero active sessions, zero outbound email configuration and preserved report WO sequence.
- This is a **database-local logical restore rehearsal**. It does **NOT** prove that an external encrypted `pg_dump`/managed backup could be restored after the entire Supabase project was lost. External backup+restore remains BLOCKED until a protected off-project dump and disposable restore target exist.

## 2. Real concurrent authenticated API operations — PASS

A one-time server-side runner executed actual concurrent HTTPS calls against a temporary restricted copy of MainTrack's real 32-action Edge Function with its DB search path set to `qa_restore`. It permitted only QA synthetic identities and a narrow 9-action subset and disallowed all browser Origins.

**5 test scenarios, 27 assertions** passed, with terminal QA DB marker `QA_RACE_PASS` and durable synthetic audit record `qa.race.passed`:
1. Two leave requests for the same employee and overlapping date, submitted concurrently: exactly one accepted and one HTTP 409 `OVERLAPPING_LEAVE_REQUEST`.
2. Duplicate concurrent Owner approval of the same leave: one actual approval, one idempotent duplicate, exactly one ledger debit and 27 → 26 annual days.
3. Two overlapping overtime requests submitted concurrently: only one accepted; other HTTP 409 `OVERLAPPING_OVERTIME_REQUEST`.
4. Duplicate concurrent approval of one 4-hour substitute overtime: exactly one **240-minute** credit. Starting bank 240 minutes → **480**, not 720.
5. Concurrent APPROVED and REJECTED decisions on the same request: one wins (REJECTED won in this run), competing decision HTTP 409; no unapproved debit. Concurrent leave reservations competing for the remaining annual balance allowed only one booking and rejected capacity oversubscription.

Post-test independent SQL verification:
`qa_restore.mt_migrations = QA_RACE_PASS`, `qa_restore.mt_audit` recorded `checks=27,raceScenarios=5`; annual balance **26 days**, substitute-time total **480 minutes**, three synthetic accounts **inactive**, **zero** test sessions and **zero** enabled outbound mail settings. `qa_full` original QA acceptance remains unchanged.

**Both temporary QA race Edge Functions were retired** by redeployment to safe HTTP 410 bodies with `verify_jwt=true`; no usable challenges, code paths or password secrets remain in them. No run secrets or bearer tokens were committed to the repository.

## 3. Web/Android update and rollback tests — PASS (simulated, not device)

Existing CI run on the QA-only branch:
**https://github.com/m-as23/ICC-Reports/actions/runs/39399586199**

- All **4/4 GitHub Actions jobs passed** on the QA branch.
- Node regression suite logged **109/109 PASS**, including signed OTA checks, refusal of unsigned/tampered and incompatible manifests, deferral for unsent reports, failed download preserving current bundle, and **simulated rollback** on boot failure.
- Chromium QA suites cover Web update visibility when newer metadata exists, and protection of unsent local reports through navigation/update simulation.
- CI also checks future Android native version identity and signing expectations without building, installing or releasing an APK.
- The newly committed `ops/maintrack/tests/recovery-and-rollback-gates.test.mjs` contains 5 additional tests but is **not yet wired into the GitHub Actions workflow**; an attempted workflow edit was blocked by platform safety checks. These five added tests are **NOT** included in the CI pass count and must not be represented as executed.
- The user's installed Android APK was **not** accessed. No real on-device signed upgrade, corrupted-bundle recovery, native data persistence, OTA roll-forward/back or physical device rollback was certified.

## 4. Remaining independent release gates (NO-GO)

1. **External backup + full disaster recovery** of an isolated project, with a protected downloadable or off-site encrypted backup, separate restore target and verified recovery-point objectives.
2. **Real device update and rollback**, signer/certificate identity, native versionCode and preservation of offline reports, from an explicitly reviewed owner-device QA candidate. Do not publish an APK as a consequence of this report.
3. **Canonical Web API parity:** the existing canonical Web source still embeds the 26-action Stage9 endpoint while the target contract requires all 32 operations, plus backwards compatibility.
4. **Full CMMS edit/delete E2E and subsequent concurrency/load resilience** beyond the report + leave + overtime flows already tested.
5. **Production DB isolation, protected Vercel deployment, canary and explicit Owner release approval**. The authoritative `employee-release-gates.json` stays `PRELAUNCH_BLOCKED` and all ten mandatory release gates pending.

## Change control

No changes to `main`, `ops/maintrack-044-production-foundation-20261018`, original Staging data `tdnkeskczcsukcujwinu`, Production, Vercel deployments, signed Android APK, OTA artifacts or employee accounts. This is **Draft QA PR #20**, stacked on Draft PR #19. Review evidence separately before any merge or release.
