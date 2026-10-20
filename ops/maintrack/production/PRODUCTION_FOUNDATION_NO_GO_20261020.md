# MainTrack — Independent Production Foundation (Prepared, NOT Live)
Date: 2026-10-20
Status: **PROVISIONING_BLOCKED_BY_SUPABASE_PLAN / RELEASE_NO_GO**.

## Resource inventory, checked before creating anything
Supabase organization: `mvvgyzwqxiebsshaphgd` (user's existing organization).
Existing active projects:
- `MainTrack-Staging` ref `tdnkeskczcsukcujwinu` — real employee staging, untouched.
- `MainTrack-RBAC-QA-Isolated` ref `szhstrafzkxzstjdcynl` — validated synthetic QA, untouched.

Proposed separate project: `MainTrack-Production` in `eu-central-1`. Supabase quoted **$0/month** for creation, but explicitly rejected the attempt because the organization owner had reached the **2-active-free-project limit**. **No third Supabase project was created.** Do not pause or delete either existing project just to bypass this without new owner approval and a verified backup/restore strategy.

Vercel team: `team_gw1E3m9dOLSi9YgupIlh5Xy1`. Project listing includes `maintrack-production` (id `prj_9IQgcJzKvkSPXxHmzDvy5DrQ0qet`); specific project inspection returned 404, so configuration or deployment status **could not be verified**. Do not assume this is production-ready, change aliases, or deploy.

## Source prepared safely on this isolated QA branch
- `ops/maintrack/production/001-private-schema-LOCKED.sql`: **23 empty MainTrack tables** in a *private* `mt_prod` schema, with RLS on each, 105 constraints, indexes, native types, three internal triggers/functions, security-invoker reporting view, revocation of direct browser roles and default privileges. No employee rows, sessions, passwords or real mail settings. **NOT executed on Supabase**.
- `ops/maintrack/production/prepare-locked-api.mjs`: generates a review-only 32-action server function from the hash-pinned MainTrack Backend source. It enforces the private schema search path, requires exact future production ref and official HTTPS origin from protected environment variables, rejects the Staging/QA project refs, and contains an **explicit hard-coded `MAINTRACK_PRODUCTION_OWNER_RELEASE_AUTHORIZED=false`** which prevents module startup even if environment variables are present. For release, that value must change in a distinct owner-reviewed commit, after QA and security review.
- `android/maintrack-app/tests/production-offline-foundation.test.mjs`: offline CI checks schema RLS/no data, exact 32-action contract, unchanged source pin, hard startup lock, ref/Origin validation, and release NO-GO.

The generated candidate is placed only under `audit-output/` with `node ops/maintrack/production/prepare-locked-api.mjs --prepare`; it is never automatically deployed. Test the source with `node --test android/maintrack-app/tests/production-offline-foundation.test.mjs`.

## Why Android has NOT yet been installed
An existing signed owner-only `0.4.5 (405)` workflow is protected by the specific `ops/maintrack-044-production-foundation-20261018` branch and a GitHub protected signing environment. This preparation branch is **not** that branch and must **not** invoke it or bypass the signing gate. Existing `ops/maintrack/scripts/owner-device-qa-preflight.py` can inspect an approved signed APK and optionally read phone package metadata without installing anything. Signed APK verification using the user's physical device requires the actual file, device access and explicit test/release approvals. OTA Web-bundle rollback is different from downgrading an installed Android APK.

## Next approval and release sequence (no auto-promotion)
1. Owner makes an explicit Supabase plan/quota decision: raise free-project limit/upgrade the existing org, **or** approve retiring one project only after independent backups are reviewed. Retain staging and synthetic QA data until approved.
2. Create the third separate Supabase project, read its exact reference and pin it in approved configuration. Never hardcode QA or Staging IDs as Production.
3. Review and apply private `mt_prod` schema-only DDL to **that new project only**, rerun catalog/RLS/advisor checks, set up encrypted external backups, confirm zero active users, zero sessions and zero email.
4. Review Production API candidate: database privileges, origin, secret rotation, rate limiting, login/error logging, true 32-action role E2E, restore, startup lock, independent owner signature.
5. Protect Vercel Production environment and review existing project, exact domain/alias and Git connection; create a preview for reviewed commit first, do not promote until approval.
6. Prepare candidate signed 405+ APK through existing protected owner-signing workflow on the authorized branch after all gating approvals, inspect it with read-only preflight, then run local work retention and actual update/rollback on the user's device.
7. Owner accepts Go/No-Go and a canary before moving any employees. Keep all TEN existing release gates pending until separately verified.

**No GitHub main/production merge, Supabase production DB mutation, Vercel deployment, APK signature, OTA publish or device install occurred here.**
