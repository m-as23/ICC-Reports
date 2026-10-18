# MainTrack unified Web + Android update — release gate (2026-10-17)

Scope: user approved preparing one synchronized feature update for the current Web and installed MainTrack Android app. **Do not interpret QA deployment as a live update.** This document is only preparation; release pointers remain unchanged.

## Verified inputs

- Feature branch: `feature/maintrack-unified-four-updates-20261017`, draft PR #1, base `android/stage14-ota-native-lab`.
- Latest UI QA deployment: `maintrack-final-security-d5xrm08yy-mohamedashrefsrag-5918.vercel.app`, serves preview-only frontend assets connected to `maintrack-unified-four-qa`.
- QA Edge `maintrack-unified-four-qa` v13, stable `maintrack-stage9-security-api` v10. Different code, even though underlying Supabase project/database is shared.
- Existing Android signed `lab` OTA manifest advertises v0.4.2; native compatibility v0.4.1–0.4.99 and source commit `da75d32a7abbaf9ef730ad4eb85aa688bac23674`. It does not contain the just-approved unified feature changes or Stage18 30-minute discovery candidate.
- User has tested installed native MainTrack 0.4.1 upgraded to UI 0.4.2 via OTA, separate from the `MainTrack Update Lab` 0.3.x application.
- `android/maintrack-app/approved-assets.lock.json` and `web/maintrack/source-lock.json` still point to older QA deployment `dpl_ARyE7KNjFKMfJCWQ4YcZZMXxykhF`. Actual `index.html`, `secure-assets/index-inline-1.js`, `secure-assets/index-inline-1.css` differ from their locked source sizes. Packaging under these stale locks is not an accepted shared source build.
- QA source-level regression harness: 20/20 passing; earlier SQL transaction constraint bug fixed. Read-only staging data confirms two owner-approved overtime records, one rejected, and two distinct credited overtime ledger sources. Authenticated old-installed-APK to new-OTA workflow not yet tested.

## Preconditions — ALL required before moving either production channel

1. **Pin reviewed source SHA** and rebuild source-locked shared Web+Android bundle; regenerate and independently verify exact SHA-256 locks and assets. Do not simply substitute a live preview URL into the signed manifest.
2. Prove the installed MainTrack native 0.4.1 still trusts the signing public key and lab channel for the new UI ZIP. Confirm owner's private key provisioned in the GitHub protected signing environment, not in chats/source; if key continuity is lost, do not change certificate or uninstall.
3. Preserve old Web `/releases/<sha>/` directories and metadata on the **existing stable origin**, with no-store discovery and a rollback path; test old tab, PWA and QR/session/local-data preservation. Do not deploy a naked static QA folder onto production.
4. Verify approved API is backwards compatible with native/old Web frontends before replacing stable v10 API; run live role-based tests for the owner, engineer and technician, including report creation and work order flows.
5. Pass the Stage18/19 actual-browser tests and the stage14 signed Android/OTA rollback and local-work guard acceptance on the **same pinned new release bytes**, including session and offline/unsent work on a physical installed app.
6. When all above pass, publish a new version above v0.4.2 to the trusted OTA manifest (signed Ed25519 and immutable ZIP), and advance the Web stable release pointer in one coordinated release window. Each client discovers metadata independently and offers manual activation; no silent download/update.
7. After rollout: monitor authentication, report posting, leave/OT approval, notifications, older clients, and rollback readiness. Never reset test data as part of the update; data cleanup is a separate owner-approved launch milestone.

## User-visible expected behavior

- Existing installed Android app stays in place. Native version stays 0.4.1 on compatible OTA; only UI bundle version changes. If a native APK is required, use exactly the existing Android app identity and signing certificate, increasing versionCode.
- While installed UI is current: update CTA hidden. On discovery of a newer verified compatible release: `تحديث متاح` appears (automatic check on supported Stage18 client at most once per 30 minutes while visible/online; older 0.4.2 client may require manual `التحقق من التحديث` first).
- User explicitly downloads/activates only after unsaved/queued work guard allows it; app reopens preserving local data and login when supported and verified.
- Web existing-tab update requires same-origin version history; fresh visits receive the new version after release pointer change. Not exactly simultaneous installs because each device checks/applies at different times.

## Verified Stage 20 QA build and release compatibility (2026-10-17)

- GitHub Actions [39066055161](https://github.com/m-as23/ICC-Reports/actions/runs/39066055161) at exact SHA `0098631f6a25bd7f9f4f795b8cf3dd6b8540eb0d`: **PASS**. 46 Node tests PASS; reviewed SHA-256/byte integrity of unsigned Web and Android OTA ZIPs; all 16 common assets identical. GitHub artifact 12113212910, 14-day retention.
- No lock overwrite or signed release occurred; new separate QA build script/workflow prepares safe immutable review-only archives. The baseline approved source lock remains stale against 3 changed UI assets, intentionally.
- GitHub run [38979572247](https://github.com/m-as23/ICC-Reports/actions/runs/38979572247) published owner-signed OTA v0.4.2 successfully on 2026-10-16 from Stage14. This confirms a working owner OTA signing path at the time, **not** that the same secret will still be available or that a future signature is approved.
- Compared currently deployed Edge sources: stable API v10 exposes 26 dispatch handlers; QA API v13 retains **all 26** and adds exactly 6 (`accountSummary`, `overtimeMine`, `overtimeRequest`, `overtimeDecision`, `overtimeInbox`, `overtimeSummary`). This is static route compatibility only. Runtime permission, older client and transactional behavior still gate promotion.
- Stable API v10 lacks all six new actions, so this review bundle **must not be installed or exposed** until backend deployment and old-client regression are approved.
- Staging and stable Edge functions operate in the **same Supabase project**, therefore DB migrations already applied there are shared; do not treat it as a separately isolated database.

Status: **Review artifacts built and verified. Rollout still blocked pending stable backend compatibility tests, owner-signed OTA for the new immutable bytes, and in-place Android/Web host acceptance.** No public rollout yet.
