# Stage16: cross-channel update foundation

Scope: `android/stage14-ota-native-lab` only. No Production/main changes.

The existing Android OTA/APK acceptance remains valid. This change adds an opt-in
Web pilot build and Web update controller using the same real local-work guard.
No Android build/emulator repetition is needed for these Web-only additions.

## Implemented

- Same-origin, uncached, bounded/timeout release discovery on startup, foreground,
  reconnection and five-minute visible checks. No automatic navigation.
- Explicit trusted-click activation, synchronous maintenance lease, fresh metadata
  check and final local-work check. Dirty editors, requests, retained/corrupt queue,
  offline state and interrupted visibility refuse activation without rewriting data.
- Metadata restricts app/channel, commit path and expiry. HTTPS hosting is the Web
  trust boundary; this is not an Android signed OTA manifest.
- Opt-in `node scripts/prepare-web-pilot.mjs` produces Vercel Build Output v3 from
  the locked shared UI plus the update additions. Existing default APK/OTA artifacts
  are unchanged. Commit tracked changes first; stale output is refused.
- Version resources are immutable, root and update metadata uncached. Manifest has
  a stable pilot ID/start URL/scope across versions; current QR query/hash is retained
  on explicit update navigation. Same-origin paths retain local storage.
- This Web pilot keeps the existing shared Pilot backend; it is not the previously
  prepared isolated no-backend UI preview. Never deploy it into Production.

## Outstanding acceptance and constraints

Vercel listing returned 403 on 2026-10-16 for the explicitly selected QA project
`maintrack-final-security-qa`, team `team_gw1E3m9dOLSi9YgupIlh5Xy1`.
No Vercel CLI is installed. No live URL or deployment was produced.

A deployment must retain old release directories alongside new ones, serve metadata
with JSON MIME/no-store and resolve directory index.html paths. This initial single
release packager does not compose historical releases automatically. Verify stable
root redirect preserves QR query on the actual host before publishing QR codes.

No service worker is enabled by this change: installed Web is an online shell,
not accepted offline cold-start support. Existing older workers, actual installability,
multiple open windows, CDN headers, root redirect and two published release upgrades
must be checked in a hosted browser before employee rollout. A different commit
(including an owner-selected rollback) is offered, not silently activated. Backend
compatibility across accepted frontend versions is a release requirement.

Permanent Android release signing/distribution and the previously observed last-write
storage durability boundary remain employee-release blockers. Do not describe this
as a completed employee update system or distribute the Debug lab pair to employees.
