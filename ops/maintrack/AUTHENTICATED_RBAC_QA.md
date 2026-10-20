# MainTrack — Isolated RBAC QA Acceptance (2026-10-20)

## Where testing actually lives

- Isolated project: `MainTrack-RBAC-QA-Isolated`, ID `szhstrafzkxzstjdcynl`, eu-central-1.
- Staging/employee project remains `tdnkeskczcsukcujwinu`; **not** a target for new authenticated tests.
- Isolated API: `https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-rbac-readonly-qa/api`.
- Source (exact deployed revision v1): `supabase/functions/maintrack-rbac-readonly-qa/index.ts`.
- Isolated DB has a **minimal RBAC-specific schema**: 11 public tables with RLS enabled, all direct browser-role table privileges revoked, zero production reports, no copied employees.
- Only synthetic QA accounts exist: `QA_RBAC_OWNER`, `QA_RBAC_ENGINEER`, `QA_RBAC_TECHNICIAN`. Active with correct roles; bcrypt passwords generated randomly inside the isolated DB and **not retrievable**. No login sessions have been issued. These credentials must be reset through a protected setup to execute live authenticated probes.

## Current verified results

1. The isolated Supabase project is ACTIVE_HEALTHY.
2. The isolated API deployment is ACTIVE, with custom opaque-token authentication (verify_jwt=false) and QA-only action gating.
3. Real remote GET `/healthz`: `status=up`.
4. Real remote GET `/readyz`: `status=ready`, only marker `20261020`.
5. Database inventory: 11/11 RLS enabled; 3 synthetic users, 0 reports, 0 sessions.
6. Github Change QA Gate (CI): offline synthetic RBAC test suite + browser/OTA regression suites passed on the isolated-script change branch. These **do not** prove real live authenticated RBAC.
7. Supabase Security Advisor: informational `rls_enabled_no_policy` for 11 deliberately deny-all tables. No browser Data API table policies are granted.
8. No MainTrack Web, Android, APK, OTA or employee backend was changed or deployed by this work.

## Read-only API scope

Only these actions are permitted on the isolated function: `login` for
`QA_RBAC_*` accounts, `session`, `profile`, `adminCatalog`
(`kind=sections` only), `adminUsers`, `leaveInbox`, `overtimeInbox`, and
`cmms` (`mode=machines` only). Every other action is rejected with
`QA_ACTION_DISABLED` before dispatch, including report submission, user
management, leave decisions, overtime decisions and password changes.

The function has no browser Origin allowlist; requests with an Origin are
rejected. QA server-to-server requests with no Origin require a valid
opaque bearer token for authenticated actions. All account codes are checked
against the exact three synthetic identities.

This schema is a **minimal, non-production functional slice**. Some Owner
actions outside the permitted read probes may still require the full 23-table
schema, so do not label this a production-equivalent backend or a full app
acceptance environment.

## How to complete the real 18-check authentication gate

The probe is at `ops/maintrack/scripts/qa-authenticated-rbac-readonly.mjs`.
It is deliberately locked to the isolated project and requires **three
distinct, real QA bearer tokens** and an explicit QA opt-in. It does not log in
or create credentials. An isolated secure provisioning process must:

1. Set three new random passwords in a protected secret manager for these
   synthetic accounts (not chat, public repo, issue or PR comment).
2. Call the isolated QA login endpoint using those secure passwords to get
   the three tokens. The QA login path creates sessions; rotate/revoke after QA.
3. Set protected runner environment secrets
   `MAINTRACK_RBAC_QA_OWNER_TOKEN`,
   `MAINTRACK_RBAC_QA_ENGINEER_TOKEN`,
   `MAINTRACK_RBAC_QA_TECHNICIAN_TOKEN`.
4. Set runner-only `MAINTRACK_RBAC_QA_PROJECT_REF=szhstrafzkxzstjdcynl`
   and `MAINTRACK_RBAC_QA_CONFIRMATION=APPROVED_QA_RBAC_READ_ONLY`.
5. Run `node ops/maintrack/scripts/qa-authenticated-rbac-readonly.mjs --live`
   from an approved, non-PR runner with outbound HTTPS and protected secrets.

Expected checks: 6 session/profile identities, 10 denied Owner-only reads
(Engineer and Technician), 2 permitted Owner reads. A status deviation, wrong
identity, inaccessible API or invalid/expired token fails closed.

## Merge/release rules

The PR remains Draft against `ops/maintrack-044-production-foundation-20261018`,
not `main`. No merge or Production deployment without explicit owner review.
Do not repoint actual Web/APK clients at this QA endpoint. Never add
`service_role`, database URL, bearer tokens, employee data or passwords to GitHub.
