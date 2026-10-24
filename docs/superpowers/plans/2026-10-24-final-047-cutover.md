# MainTrack 0.4.7 Final Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Publish the accepted 047 runtime as the first operational release and retire earlier clients.
**Architecture:** Preserve accepted source and derive byte-verified Final Web/native packages with dedicated `maintrack-final-047` and `maintrack-inventory-final-047` endpoints. Build/sign before any destructive cutover; retire old endpoints only once the final client works.
**Tech Stack:** Existing Node/Capacitor/Android, GitHub protected signing environment, Vercel, Supabase opaque sessions.
**Spec:** `docs/superpowers/specs/2026-10-24-final-047-release-verification.md` plus Owner's explicit Final/cutover approval in this conversation.

## Global Constraints

- Original appId `com.icc.maintrack`, Android 407/0.4.7, original certificate `07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b`.
- No secret values in logs, local output or artifacts. Signing only through `maintrack-android-release`.
- Current project remains MainTrack-Staging; do not silently switch to a Production database.
- Old test data is disposable per Owner. Do not erase it before deployable signed replacement and Owner bootstrap are available.
- Existing UI/search/ledger behavior and local-work/update guards stay unchanged.

## Review Focus

- Package with mixed old/new endpoints must fail verification.
- Tampered Web or native bytes must fail verification.
- Old clients with new credentials must still be denied after retirement.
- Closing old routes must not close inventory worker or mail delivery needed by Final.
- A missing signing key or denied branch must stop cutover before resets/retirement.

### Task 1: Final packaging and protected original-key build

- [ ] Add failing test for final branding, endpoint replacement, Web/native parity and tamper rejection.
- [ ] Implement isolated `prepare-final-047.mjs` derived from verified `prepare047`, with strict verification against its preserved base.
- [ ] Add original-package final APK verifier and protected artifact-only workflow on exact release branch.
- [ ] Extend existing 047 actual-candidate/legacy QA branch routing; register new signer explicitly in workflow audit.
- [ ] Run packaging tests and security audit; push exact candidate; verify CI and signing result.

### Task 2: Final service and clean launch preparation

- [ ] Compare current deployed functions with reviewed source; stage new final routes with existing auth and private inventory worker.
- [ ] Enumerate tables/dependencies and historical writable endpoints; prepare transactional test-data reset and Owner bootstrap without exposing credentials.
- [ ] Verify final endpoint health, auth denial, authorized roles and existing functional journeys before cutover.

### Task 3: Coordinated cutover

- [ ] Publish matching Final Web and signed APK/compatible OTA; confirm install/update behavior.
- [ ] Reset approved test data and revoke old sessions; retain required Owner/bootstrap and configuration.
- [ ] Retire historical writable routes; test old-client login/write rejection and Final success.
- [ ] Publish APK and Web links, record evidence and remaining device action.
