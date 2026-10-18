# MainTrack Stage22 — QA acceptance gate (2026-10-18)

**Scope**: QA branch only. No production deployment, stable Edge change, OTA publication, signing-key replacement, user-data reset, or migration.

## Review identity and artifact integrity

- Owner approvals UI source: `b8aaffb4e13269bccd18c0b6736a5fd17192e57b`.
- Vercel static QA preview: `https://maintrack-final-security-ldgcbkqqw-mohamedashrefsrag-5918.vercel.app`, deployment `dpl_DA1z9Bt8ZcyCQHtTaUk9fvTTvQDf`; confirmed `READY`.
- Owner confirmed the Vercel sign-in succeeds and the unified pending Inbox and approval history layout matches the accepted design.
- Supabase QA function `maintrack-unified-four-qa` v15. Exact Vercel preview origin added to existing CORS allowlist, without wildcard and with origin refusal preserved.
- Stable API `maintrack-stage9-security-api` remains at v10 and `main` remains at `a33770eb818a005732aa7d94f002929660747994`.
- Stage22 build: GitHub Actions run [39104596650](https://github.com/m-as23/ICC-Reports/actions/runs/39104596650), 34 source tests and 6 synthetic-browser tests passing; Android build passing.
- Android QA Debug package `com.icc.maintrack.stage22qa`, version `0.4.6-stage22qa`; SHA-256 `e66fe09b9096d2de35a6d062585961a78faa240bdfedb18986c77550527b475c`; source assets verified byte-identical to QA Web JS. This is **not an in-place upgrade of `com.icc.maintrack`**.
- Live cross-origin tests: [39114367819](https://github.com/m-as23/ICC-Reports/actions/runs/39114367819) PASS for Vercel; [39115114979](https://github.com/m-as23/ICC-Reports/actions/runs/39115114979) PASS for native `https://localhost` WebView preflight and unauthenticated session rejection. An untrusted website origin remains denied.

## Read-only staging DB audit

Checked approval records and compensatory time ledger counts **without writing any data**. No pending requests were present at the time of the audit. The checked invariants found no pending record with a decision timestamp, no resolved record missing a decision timestamp, and no duplicate overtime/leave ledger entries.

**Important: QA Edge and stable Edge share the same Supabase project and Postgres database.** Do not generate test requests or mutate data automatically under the assumption that QA is an isolated database.

## Remaining gates before any production release

1. **Native physical acceptance**: install the *separate* Stage22 QA Debug APK alongside the already installed application, without uninstalling or clearing data. Test opening, QA account sign-in, archive view and bell notifications. This does not prove in-place upgrade compatibility.
2. **Actual approve/reject integration**: no pending requests existed in the shared DB. Use owner-approved disposable employee accounts / approved test records, or a genuinely isolated test DB, before completing live approval actions across annual leave, financial overtime and substitute time. Confirm transition from pending to history, type filters and active-notice removal with archive retention.
3. **Native installed-app update compatibility**: verify existing `com.icc.maintrack` trust root / signing identity, current 0.4.2 signed OTA and local unsent queue on a real installed phone. The Stage22 Debug APK cannot replace it. A new owner-signed compatible OTA archive is required if the installed native bridge supports the feature; if not, use the existing signed APK key and higher versionCode.
4. **Backend compatibility**: exercise old native/Web clients against the candidate stable API changes. Stage22 frontend requires QA-only overtime endpoints missing from current stable v10, so frontend deployment alone would break new features.
5. **Web release safety**: immutable assets and same-origin update pointer on existing stable host, proper cache behavior, rollback, authentication and unsubmitted report preservation. No change on the production domain without explicit owner approval.
6. Only **after** gates pass and owner authorizes release, stage a coordinated Web and signed Android update with rollback. Hidden update CTA while up-to-date; visible only when a verified compatible update is available.

This is an acceptance record and release gate, **not** authorization or evidence of any published production release.
