# MainTrack 0.4.7 Final — database cutover complete; archive cleanup pending

## Published and verified

- Runtime source: `16a0475b782a5d041f63c59a81a30e4692967e8e`.
- Protected build/signing: https://github.com/m-as23/ICC-Reports/actions/runs/40101009236 — both jobs succeeded after Owner allowed the release branch in the signing environment.
- Original-package APK: `com.icc.maintrack`, 407 / 0.4.7, 5,169,966 bytes.
- APK SHA-256: `7b3982e52163a127535d48e33e9bf1f7bd87db8513263c02dc59a1ca6cac47e3`.
- Original certificate retained: `07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b`; v2/v3 signatures verified. All 36 native application assets independently compared with locally regenerated source.
- Native startup now checks the actual sidebar button (`v6Toggle`), replacing the removed dock requirement. Full-host browser readiness checks and 108 native behavior tests passed.
- Native in-app updater is included with the existing signed trust configuration and 30-minute metadata discovery. Existing report queue and activation protections remain unchanged. No physical installation/OTA activation claimed.
- Immutable OTA ZIP: `c2f5943c251ee043c9521de71d83ba6e5b36135d/updates/android/maintrack-0.4.7-final.zip`, 190,832 bytes, SHA-256 `babe0345fbde1b72d613462c1af7ec6d355700d882e349f46c4bba1af95bf395`.
- Signed discovery published on the existing lab manifest path; verified via public URL. Native floor is 0.4.7. Existing six-day metadata validity policy remains: renewal is needed before expiry; expiry does not stop reporting, but prevents accepting expired update metadata.
- Web: https://maintrack-final-security-qa.vercel.app/ — Vercel deployment `dpl_BV59i7HuUJnjgTbmSSzBF7VqhUVj`, production target within the existing QA project. All 31 served application files matched prepared source without Vercel sign-in. Preview/deployment URLs retain Standard Vercel protection; application authentication still governs data.
- Final APIs: `maintrack-final-047` and `maintrack-inventory-final-047`, both on the existing MainTrack-Staging project. Health, CORS and unauthenticated rejection passed. Temporary Owner/Engineer/Technician login/session/init/profile, Owner admin/ledger permissions and inventory-version access passed.

## Old Supabase clients retired

Each of these old client routes now responds HTTP 410 / `UPDATE_REQUIRED`, with no database access:

- `maintrack-stage6-api`
- `maintrack-stage9-security-api`
- `maintrack-unified-four-qa`
- `maintrack-stage22-release-canary`
- `inventory-session-storage-staging`
- `maintrack-inventory-047-qa`

Live probes passed for all six. This proves retirement of these identified service routes; it is not a census of every historic APK or external legacy Apps Script deployment. The existing internal mail worker was retained because Final still uses its outbox processing.

The release QA workflow now probes Final health/auth and old-route retirement, rather than expecting a retired QA API to remain healthy. No main branch merge or separate Production database migration occurred.

## Database reset completed by Owner

Owner explicitly authorized discarding all current test application data. A prepared transaction is in `ops/maintrack/final-047-reset.sql`. It replaces all old users with a new `OWNER`, preserves the active `PILOT01` password hash without reading it into logs, and forces first-login password change. Reports, requests, balances, sessions, catalog and inventory test rows are cleared; schema migrations, mail configuration and standard status/category choices remain.

Both the live rollback-only attempt and the subsequent actual reset request returned Supabase connector `Invalid or expired requestState`. No reset succeeded. Fresh verification still showed 18 users (including three temporary release-test accounts), 132 reports, existing `PILOT01`, and no `OWNER`.

The reset has two passing disposable PGlite tests: successful bootstrap/cleanup/configuration retention, and rollback on missing Owner or an unexpected dependency. These use simplified fixtures and do not establish compatibility with every live trigger/default/FK. An independent reviewer checked the destructive scope; inventory is locked before generation capture; no CASCADE is used. Storage keys are captured before truncation and returned for scoped cleanup.

### Verified Owner execution

The Owner executed the reviewed SQL through the Supabase SQL Editor. Returned cutover time: `2026-10-24T17:34:37.041135+00:00` (20:34:37 Cairo). Independent database verification found exactly one active user, `OWNER`, role Owner, with first-login password change required. Reports, leave/overtime requests, sessions, inventory items/versions and sections all contained zero rows. The old users, including temporary release-test accounts, are gone. Do not rerun the reset on new operational data.

All eight CI checks on maintenance commit `bbff5ff0c5690cb367346437210822f5a16bf66c` succeeded, including Final health/auth and six-route retirement. The APK runtime remains pinned to `16a0475b782a5d041f63c59a81a30e4692967e8e`.

### Remaining scoped archive deletion

Four pre-cutover private XLSX objects still exist in `maintrack-inventory-archive-staging`:

- `inventory/imports/6090cd35-6964-4870-bdda-ef7dc0b6ef56.xlsx`
- `inventory/imports/40fefb2c-a69d-4867-8039-1683174eb74c.xlsx`
- `inventory/imports/b58d48e1-9c8c-4490-99f1-891d440f038d.xlsx`
- `inventory/imports/627330b7-567c-40b6-8e10-8a4e5327c9ad.xlsx`

A proposed temporary, nonce-authenticated cleanup Edge Function was rejected by automatic approval review because it would deploy a public endpoint with JWT verification disabled and service-role Storage deletion capability. No cleanup function was deployed; this was independently confirmed through the function inventory. Its temporary local credential was removed. No workaround to that rejected implementation was attempted.

Use direct Storage deletion of these exact four objects through the Dashboard or an authorized direct Storage tool. Preserve new uploads. Do not delete Storage metadata with SQL.

For the Owner's existing test handset, clear prelaunch local app data once when adopting the fresh account, after installing the original-package Final update. This is distinct from future compatible updates, which preserve operational reports/queues.

**Verdict:** Ready with known limitations — Final software, fresh database and old-client retirement are verified. Four authorized old archive objects remain pending direct Storage deletion. Actual handset installation and first-login password change remain user actions.
