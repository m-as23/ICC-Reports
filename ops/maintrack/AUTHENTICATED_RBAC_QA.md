# MainTrack — Authenticated RBAC QA acceptance

Verified: **2026-10-20**. Scope: dedicated test Supabase project only.

## Isolation
- Project: `MainTrack-RBAC-QA-Isolated` (`szhstrafzkxzstjdcynl`), Frankfurt.
- The employee Staging project `tdnkeskczcsukcujwinu` was **not** used for the authenticated acceptance run.
- API: `https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-rbac-readonly-qa/api`.
- 13 isolated, RLS-enabled public tables; zero production reports and zero real employee identities transferred.
- Exactly three synthetic identities with matching roles: `QA_RBAC_OWNER`, `QA_RBAC_ENGINEER`, and `QA_RBAC_TECHNICIAN`.
- Auth is the application’s opaque session/token mechanism, **not Supabase Auth JWT**. `verify_jwt=false` on the isolated API is intentional because its code performs authentication itself. Direct anon/authenticated table access remains revoked.

## Actual acceptance — PASS
The first one-time test was executed **against the deployed Edge API**,
not a mocked browser, and the isolated database reached the terminal marker
`rbac_qa_pass` only after all assertions passed.

- 6/6 real authenticated session/profile identity checks.
- 10/10 expected HTTP 403 FORBIDDEN for Engineer and Technician on Owner-only reads.
- 2/2 Owner-only positive metadata reads returned HTTP 200 with the expected shape.
- 9/9 additional negative controls: missing/fake token, non-QA login, unauthorized mutations, role spoofing, rejected Origin and wrong catalog/CMMS scope.
- 4 fixture preflight assertions (account count and role/status checks), for 31 total assertions.

The second one-time test verified **real password login**, followed by
session and profile calls, for each synthetic account. Its success marker
`qa_login_pass` is recorded only after **13 assertions passed**:
- Three correct QA identities/roles validated.
- Three genuine password logins returned opaque tokens and correct roles.
- Three post-login session requests returned the right role.
- Three profile requests returned the correct identity.
- Plus the fixture account-count preflight.

The one-time endpoints produced duplicate GET HTTP 409 on the external
URL-fetching client; this is the expected fail-closed response to a replay.
The authoritative completion evidence is the durable terminal database
markers, which were separately read through Supabase.

## Post-test security verification
- Three QA identities remain in the isolated database but are now **inactive** (`active=false`).
- Their temporary passwords were replaced by new high-entropy hashes, and their `token_version` advanced, invalidating old sessions.
- `mt_sessions` = **0**; `mt_reports` = **0**;
  `mt_leave_requests` = **0**; `mt_overtime_requests` = **0**.
- 13/13 public test tables have RLS enabled; direct read/write checks for browser roles were denied.
- Both temporary acceptance functions (`maintrack-rbac-one-shot-runner` and
  `maintrack-rbac-login-once`) have been **retired**: safe 410 handler,
  `verify_jwt=true`, no test code or shared secret in their current deployments.
- The read-only QA API continues to deny report creation, user edits, approvals and other mutations.
  Its session TTL was reduced from seven days to **three minutes** in QA only.
- No secrets, raw passwords, bearer tokens, or QA challenge strings are committed to GitHub.

## Source/CI evidence
- Isolated API: `supabase/functions/maintrack-rbac-readonly-qa/index.ts`.
- Offline CI authorization contract: `ops/maintrack/tests/qa-authenticated-rbac-readonly.test.mjs`.
- Optional protected external probe: `ops/maintrack/scripts/qa-authenticated-rbac-readonly.mjs`.
- Branch: `fix/maintrack-staging-role-ui-qa-20261020`; **Draft PR #19**, target
  `ops/maintrack-044-production-foundation-20261018`. Do not merge without owner review.

## Limitations
This is real authenticated access-control and password-login acceptance against a
**13-table minimal isolated RBAC fixture**, not a full production-equivalent
23-table MainTrack system. Passing these tests does not prove that all
report/leave/overtime **write** workflows or Production permissions are secure.
A later full staging-to-release audit must run separately before production rollout.

No Vercel deploy, app release, APK/OTA update, Production write, employee
password reset or MainTrack main-branch merge was performed.
