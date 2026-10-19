# MainTrack — Next Android 405+ QA Packaging / PR #8 Reconciliation

## Scope
This is source-only STAGING QA, **not** a signed APK, installable update, employee rollout, Web deployment, signed OTA or Supabase mutation.

### Changes preserved from PR #8 (without merging its now conflicting diff)
- Full `web/maintrack/public/` browser asset set is copied into a separate `audit-output/maintrack-qa-bundle` directory.
- Only `secure-assets/index-inline-1.js` differs, by the **single reviewed API URL swap** from legacy `maintrack-stage9-security-api` to Staging `maintrack-unified-four-qa`.
- The pinned original JS blob established by PR #9 still controls the rewrite. All other asset bytes and source files remain unchanged.
- Existing Chromium browser fixture is prepared from the same 32-action Staging QA asset set.
- Browser tests expect the 32-action endpoint. No current Owner 0.4.4 installed bundle or frozen Android archive was changed.

### Post-signing APK validation staged (but no signing occurs)
A new `inspect-signed-apk.mjs` tool parses **independent Android SDK** `aapt dump badging` and `apksigner verify --verbose --print-certs` evidence after signing:
- `com.icc.maintrack` installation package
- Native versionCode `405` or greater and strictly above `MT_ANDROID_LAST_VERSION_CODE` (Owner verified `404`)
- Native versionName strictly greater than `0.4.4`
- One signer with **exact** existing installed Android certificate SHA-256
- Verified v2/v3 strong APK signature
- No employee-rollout claim and on-device upgrade remains NOT_RUN

Unit tests use synthetic SDK outputs only; they do not prove a physical APK has been signed or installed.

### Critical native upgrade blocker discovered
The current canonical `web/maintrack/public/index.html` does **not** reference `secure-assets/stage20-native-session.js`, and the canonical `web/maintrack/public/secure-assets/stage20-native-session.js` **does not exist**. The Owner-tested `0.4.4` APK had a secure native session bridge sourced from the previous reviewed Android LAB archive. It would be unsafe to package the new unified Web browser fixture directly as `405` without restoring/verifying that trusted secure session JS and the OTA/local-work bootstrap.

The native preflight now **fails closed** on this missing bridge. The ordinary browser QA audits this issue but does not pretend an unsigned Web fixture is a ready-to-sign native APK.

### Must happen before an Owner-accepted signed 405 APK
1. Recover approved exact `stage20-native-session.js` from Owner verified 0.4.4 artifact, verify hash/signature and script ordering, and combine with the Staging QA bundle without replacing canonical Web source.
2. Validate secure session and local queue behavior across 0.4.4 -> 0.4.5 device upgrade; do not uninstall or reset the installed app.
3. Construct gated Android builder at reviewed SHA, with proper signed APK receipt verification and Owner-only private QA artifact. Native signing key is distinct from OTA Ed25519 key. Currently no new signed-405 builder/workflow is enabled.
4. Review unused historic write-capable workflows; restrict any OTA publication to authorized channels and verified approval.
5. Do not change GitHub Environment `MT_ANDROID_LAST_VERSION_CODE=404` until the next signed APK is actually distributed and accepted.

The existing Github RuleSet and Environment access controls remain unchanged. Never merge PR #8 unchanged: its changes collide with already merged PR #9, and are incorporated here through the smaller supported path.

**NO APK MADE. NO MERGE. NO DEPLOY. NO DATABASE WRITE.**
