# MainTrack — Authenticated RBAC QA (Staging, read-only)

## Status (2026-10-20)

**Provisioned inactive; not live-executed (2026-10-20).** The existing
project `MainTrack-Staging` (`tdnkeskczcsukcujwinu`) contains reports,
users and sessions. Three new accounts `QA_RBAC_OWNER`,
`QA_RBAC_ENGINEER` and `QA_RBAC_TECHNICIAN` were inserted in one guarded
transaction, each with its matching role, **active=false**, **must_change=true**,
an independently generated random bcrypt password hash, and **zero sessions**.
The generated cleartext passwords were never returned and cannot be retrieved;
a controlled staging-only password reset and activation are prerequisites for
live testing. Do not use production/employee/PILOT credentials.

The normal change gate executes ONLY
`node --test ops/maintrack/tests/qa-authenticated-rbac-readonly.test.mjs`
(offline synthetic mocks + source guard assertions); this is not a live
authorization acceptance result.

## Runtime probe

`ops/maintrack/scripts/qa-authenticated-rbac-readonly.mjs` is intentionally
opt-in. It uses already-issued session tokens; it **never logs in**, guesses
passwords, creates users, saves reports, approves leave/overtime or changes
any other database value.

It sends only POST requests to the explicitly allowlisted Staging QA function
`https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api`.
Actions are limited to `session`, `profile`, `adminCatalog` (sections),
`adminUsers`, `leaveInbox`, `overtimeInbox` and `cmms` (machines).
Every such action is read-only in the reviewed server source. No response
bodies, user names or access tokens are printed in the report.

### Provisioning prerequisites — do not automate against existing users

1. Verify that this Supabase project is **not** serving employee Production
   traffic. Its name alone does not prove isolation. If not verified, keep
   the authenticated probe blocked and provision a genuinely isolated QA DB.
2. **Account placeholders are provisioned, but intentionally disabled.**
   After verifying isolation, reset each random unrecoverable placeholder
   password through a controlled staging-only process, securely convey
   credentials through a secret manager (never the repo or chat), activate
   just the three approved QA identities, and complete the mandatory first
   password-change flow to reach `must_change=false`. Do not repurpose
   employees or historical PILOT accounts.
3. Log in once via an approved secure QA client to issue a token for each account.
   Do not paste tokens, passwords, service-role keys or database connection
   strings into ChatGPT, the repository, or issue/PR comments.
4. Store the three tokens as protected **GitHub Environment Secrets** (or a
   local, non-committed secret store) using names
   `MAINTRACK_RBAC_QA_OWNER_TOKEN`,
   `MAINTRACK_RBAC_QA_ENGINEER_TOKEN` and
   `MAINTRACK_RBAC_QA_TECHNICIAN_TOKEN`.
   Scope them to an explicitly approved Staging QA runner, never a fork PR.
   Tokens expire; revoke/rotate them when QA is complete.
5. For an approved manual invocation, supply
   `MAINTRACK_RBAC_QA_PROJECT_REF=tdnkeskczcsukcujwinu` and
   `MAINTRACK_RBAC_QA_CONFIRMATION=APPROVED_QA_RBAC_READ_ONLY` via the
   protected runner environment. Then execute
   `node ops/maintrack/scripts/qa-authenticated-rbac-readonly.mjs --live`.
   This **is not** a GitHub workflow trigger today. Do not enable a live CI
   job until required reviewer/environment protection is configured.

## Expected acceptance

- Session and profile are checked first for all three identities. Every
  employee code must match its exact `QA_RBAC_*` value or the probe aborts.
- Engineer and Technician must each receive **HTTP 403**
  `{"error":"FORBIDDEN"}` on each of the five Owner-only reads.
- Owner must receive **HTTP 200** on the limited catalog and machines reads.
- All 18 authenticated, read-only probes must pass.
- A 200 on a forbidden action, token mismatch, unavailable secret, incorrect
  project/URL, or missing owner confirmation **fails closed**.
- The CI mock test checks the logic without network. Actual live acceptance
  remains **PENDING** until isolated QA accounts and protected secrets exist.

## Explicitly out of scope

No Production/main changes, deploy, Supabase migration, schema modification,
credential creation, password reset, rate-limit probing, report submission,
approve/deny actions, OTA, APK installation, or bulk data export.

This probe validates a small critical **read-only subset** of the RBAC
contract. It does not imply that every mutating API action is secure, and
a green unit test does not guarantee that deployed code matches this commit.
