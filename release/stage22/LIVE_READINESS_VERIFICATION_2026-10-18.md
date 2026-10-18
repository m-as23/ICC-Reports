# Stage 22 / 0.4.4 — Live Readiness Verification (18 Oct 2026)

Decision: **NO-GO for Production; QA READ-ONLY CHECKS PASSED**.

This is a read-only release checkpoint. No production web alias, Supabase stable API, Android OTA manifest, local user data, default branch or signing key was changed as part of this verification.

## Verified observations

- Connected Vercel team: `team_gw1E3m9dOLSi9YgupIlh5Xy1`. Only discoverable project in this connection: `maintrack-final-security-qa` (`prj_7l6q0Qx7vV7K5LP52MUNXjBOD3ZQ`). Latest inspected QA Preview: READY. This does not identify or authorize any official employee-facing production host.
- QA site `https://maintrack-final-security-qa.vercel.app` fetched live and returned the MainTrack Pilot landing page.
- Connected Supabase project: `MainTrack-Staging` (`tdnkeskczcsukcujwinu`), `ACTIVE_HEALTHY`.
- Existing function `maintrack-stage9-security-api` v10 is ACTIVE with `verify_jwt=false`, relying on in-function custom authorization; no promotion or config change made.
- Candidate `maintrack-unified-four-qa` v15 is ACTIVE, and separate `maintrack-stage22-release-canary` v1 is ACTIVE. Static switch-case inspection found 26 existing stable actions retained and six additional actions: `accountSummary`, `overtimeMine`, `overtimeRequest`, `overtimeDecision`, `overtimeInbox`, `overtimeSummary`.
- Live unauthenticated read-only GET `.../maintrack-stage22-release-canary/healthz`: `status=up`; GET `.../readyz`: `status=ready`, `database=postgresql`. Both identify `stage=staging`. Note legacy `service=maintrack-stage6-api` label in health check response; do not confuse it with evidence of production promotion.
- On branch `android/stage14-ota-native-lab`, `updates/android/release.json` still advertises signed LAB OTA `0.4.3`, app ID `com.icc.maintrack`, native compatibility 0.4.1–0.4.99, and unchanged local queue contract `{reportQueue:1,writesReportQueue:1,migration:"none"}`.
- GitHub Actions Stage22 preflight / unsigned 0.4.4 review passed [39127236099](https://github.com/m-as23/ICC-Reports/actions/runs/39127236099). The review-only integration passed [39127423740](https://github.com/m-as23/ICC-Reports/actions/runs/39127423740); owner-key **sign-only** attestation passed [39128201274](https://github.com/m-as23/ICC-Reports/actions/runs/39128201274). Sign-only attestation does **not** sign/publish an OTA archive or update the active manifest.

## Unresolved release gates

1. Identify and verify the **actual employee-used stable web origin** and Vercel project/deployment ownership (not the QA hostname). Preserve same-origin browser sessions and offline report queues.
2. Run authenticated Owner / Engineer / Technician live regressions against explicitly approved isolated/synthetic records. Check older-client compatibility; reports create/save and CMMS; overtime and leave decisions; notification visibility. The staging functions share a database — function isolation is not data isolation.
3. Check deployed stable Web version pointer and immutable assets on the verified origin; pin byte-identical Web/Android 0.4.4 UI, preserving old clients and rollback assets.
4. Produce a signed 0.4.4 OTA archive and signed manifest using existing owner-held Ed25519 trust root. Check bundle SHA, client compatibility and offline queues, then stage LAB. Do **not** publish review-only unsigned archives.
5. Any native secure-session package changes require an actual signed APK upgrade, with **same** `com.icc.maintrack` app ID and matching installed APK certificate fingerprint and higher versionCode. A differently signed QA/debug APK is not an in-place upgrade.
6. Advance official Web and Android pointers only after all checks pass, then monitor logins/reports/approvals/notifications with rollback available.

**Not done:** no Production deployment, no stable Edge function change, no official Web domain alias change, no live user-data test writes, no signed 0.4.4 OTA publication, and no installed-APK certificate proof.

Do not modify `main` or `android/stage14-ota-native-lab` as a shortcut, wipe data, or uninstall the owner's existing APK.
