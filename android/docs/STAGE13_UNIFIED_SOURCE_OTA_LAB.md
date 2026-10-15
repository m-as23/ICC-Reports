# Stage 13: unified source and OTA lab

All changes are isolated to branch android/stage13-unified-source-ota-lab.

Confirmed source of truth: web/maintrack/public. GitHub Actions imported these exact 18 approved resources from the accepted Stage11 APK, verifying every SHA-256 from approved-assets.lock.json, including the CSP-modified HTML separately.

Unified CI:
- Web preview is an artifact only. NEVER auto-deploy to existing Vercel projects.
- Android build reads the same source files locally; no mutable Vercel fetch during the build.
- Capgo native plugin 8.53.0 remains installed with autoUpdate='off'; no production or pilot update channel URL configured.
- Stage13 OTA laboratory code is NOT wired into production UI or mobile device update flow. It uses ephemeral test-only Ed25519 keys, never saved to Git.
- Signed lab release metadata binds URL, native compatibility, ZIP SHA-256 and max size, expires within 7 days, and is refused for other domains / insecure URLs.
- A native download operation is guarded twice against queued report drafts and active submissions. It schedules a bundle for next safe restart but does not immediately reload.
- Rollback unit test injects a failure and uses a mock native updater reset; this is NOT a demonstrated real-device rollback.

Next before real OTA:
1. Implement native updater notifyAppReady before any API requests, using a bundler and an APK integration smoke.
2. Prove real native checksum handling and test true device rollback and persistent localStorage report queue through failed OTA.
3. Configure a user-controlled signing key outside Git, and an isolated HTTPS test host for bundle content. Signing public key must be pinned in app binary.
4. Staged deployment optional -> mandatory only after compatibility + offline acceptance.
5. Signed Release APK and shared web deployment stay manual approval gates.

Current source remains compatible with Stage9 isolated API, but this repo artifact is not a new Vercel deployment.
