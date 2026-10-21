# Android B2 QA Implementation Plan

> For agentic workers: use executing-plans inline. User already authorized continuous isolated QA execution.

Goal: Build a separate Android B2 QA APK and prove native encrypted-session store/force-stop/offline restore/logout on Android 35.
Architecture: Reuse the pinned canonical client and existing native bridges. Generate assets inside an isolated scratch build directory, replace the API only in that candidate, suppress external update paths, enforce B2-only network policy. GitHub Actions builds a debug-only package and runs existing synthetic native-session checks adapted to the separate package.
Tech Stack: Capacitor 8.5.2, Java 21, Android SDK 36, emulator Android 35, Playwright 1.62.1.
Spec: this conversation's authorized B2 QA scope and qa/isolated-e2e-20261021 prelaunch constraints.

## Global Constraints
- No MainTrack/Staging/Production writes or deploys. No original signing key or database/admin credentials in CI/APK.
- Package com.icc.maintrack.b2lab; Debug only. B2 project szhstrafzkxzstjdcynl and function maintrack-isolated-e2e-b2 only.
- Native session test synthetic/offline; no claim that this is live Android-to-B2 business testing.
- No APK upload until native acceptance passes; no employee release or OTA publication.

## Review Focus
- Residual external URLs must not be reachable via fetch, XHR, workers, or native updater.
- Installed package must not overwrite com.icc.maintrack.
- Cold-start network traffic must be blocked before DevTools attaches.
- Native test must fail if session is plaintext or missing after force-stop.
- Workflow failures must preserve logs without exposing secrets.

### Task 1: Isolated candidate generator
Files: prepare.mjs, prepare.test.mjs in this directory.
Interface: transformAssets(candidateRoot) stages B2-only client; no canonical source mutation.
- [ ] Write and observe failing tests for API rewrite, unknown target fail-closed, update suppression and CSP.
- [ ] Implement transform and build preparation in a private runner copy; run node --test.

### Task 2: Android workflow and native test
Files: .github/workflows/maintrack-android-b2-qa.yml, device.mjs.
Consumes candidate www and existing native bridge/tests; produces Debug APK plus provenance only after acceptance.
- [ ] Adapt existing proven session test to package b2lab and enforce no-backend acceptance.
- [ ] Validate script syntax and workflow structure locally.
- [ ] Fresh independent review, then push only dedicated QA branch; observe build/emulator result.

## Ledger
Ruling: Run synthetic native acceptance before live Android business flows. CI has no B2 credentials; synthetic native proof is independently useful and must not be mislabeled live E2E.
