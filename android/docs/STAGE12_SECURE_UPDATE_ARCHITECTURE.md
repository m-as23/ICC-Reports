# MainTrack Stage12 — Secure Update System (pilot design)
## Status: POLICY FOUNDATION ONLY — NOT ENABLED ON EMPLOYEE DEVICES

Our employees use personal Android phones and personal PCs. There is no Android Enterprise / managed Google Play / EMM enrollment. There are **no paid subscriptions** or Play Console fees authorized.

Current verified baseline: Stage11 APK v0.2.0, pinned secure UI bundle; `main` branch and production Vercel app are protected. Isolated API is maintrack-stage9-security-api; live database is shared.

The policy module `update-system/policy.mjs` contains:
- Ed25519 signature verification for version **metadata**, pinned to an approved public key at deployment time.
- 24-hour interval helper, no update request on every app opening.
- Fail-open **for app startup** when update policy server is unavailable; fail-closed **for applying an untrusted update**.
- Safeguards for unsent reports, dirty form, unknown queue state, offline, submissions in flight.
- Separate native version minimum (requires signed APK) from web bundle updates.
- Maximum 3-second optional metadata request, zero credentials, no Supabase DB reads.
- The metadata format intentionally cannot include a bundle URL until the OTA plugin with native authenticity verification is integrated.

Security limitations / gates:
1. **DO NOT publish a forced-update policy without a working, tested update path and read-only offline draft recovery.**
2. Verify UI bundle at the native boundary using vendor's signed OTA mechanism, not only a JavaScript hash or HTTPS.
3. Add compatible `@capgo/capacitor-updater` dependency pinned, with `autoUpdate: 'off'` initially. Confirm vendor signing/encryption key usage and genuine rollback from device. This is not yet done.
4. Create a single source of truth in GitHub for Web and Android; do not overwrite the protected web projects.
5. Never make login or main UI wait for an online update check.
6. Prevent OTA switching while localStorage report queue exists or user is editing a form. Reverify the real app's queue schema and session binding.
7. Backend `minClientVersion` policy may be added after compatibility rollout. Server authorisation remains independent of a cosmetic UI gate.
8. Distribute signed APK outside managed Play if desired, with system installation consent. Protect signing keystore under user control.
9. Conduct a single consolidated real-device final acceptance after automated regression/security/offline testing. Pilot rollout before mandatory policy.

## Hosting cost
- Android Enterprise managed Google Play inappropriate without enterprise device enrollment / EMM.
- Play Console developer account is currently a **US$25 one-time fee** if publishing on ordinary Play (conditional account requirements).
- Capgo Cloud currently has paid ongoing plans and credit billing; plugin supports self-hosting with operational burden. Do not sign up for a paid plan without explicit owner approval.

See official documentation: https://capgo.app/docs/plugins/updater/ and https://developer.android.com/guide/playcore/in-app-updates .
