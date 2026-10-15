# MainTrack — reviewable update and release path

No production endpoint, production signing key, paid service or employee channel is
enabled by this work. Everything remains on `android/stage14-ota-native-lab`.

## Web in the browser

1. Build the exact approved shared source, then run the unit and actual-UI tests.
2. Produce `maintrack-web.zip` and its per-resource/checksum manifest with the
   candidate workflow. It also produces the same bytes as an unsigned OTA archive.
3. After hosting approval, publish a complete version under `/releases/<commit>/`.
   Never overwrite resources in an existing version. Relative asset URLs stay
   inside that version; cache versioned resources immutably and keep any latest
   redirect/update metadata uncached.
4. Change the entry redirect only after review and a smoke test. Existing open
   pages continue on their version; do not automatically reload an edited form.
5. Roll back by moving the entry redirect to an accepted compatible version.
   This changes frontend delivery only, never reverses backend/database migrations.

This is a distribution contract and artifact preparation, not an implemented
hosting deployment. Backend compatibility with both versions is a release gate.

## Web inside Android (OTA)

1. Sign immutable metadata binding URL, SHA-256, app/channel, native compatibility,
   expiry and the unchanged local-data contract. The production key must remain
   outside source control. The current controller accepts the lab channel only.
2. The trusted client verifies metadata, then downloads without scheduling a native
   switch. Reopening/backgrounding cannot activate that unarmed candidate.
3. A later explicit user action re-verifies expiry/signature and current local work,
   enters a short maintenance interval, and calls native `set()` directly.
4. The new bundle acknowledges readiness only after the actual local UI and queue
   reader load. Connectivity and login are not prerequisites. Failure leaves native
   rollback responsible for returning to the last accepted compatible bundle.
5. Keep the previous good bundle. Never restore an old snapshot of the queue: doing
   so could reintroduce already-submitted reports. Preserve account and `cid` identity.

A schema-changing OTA is currently refused; both versions use the existing `q`
array. This rule does not claim support for arbitrary future data migrations. The
UI blocks activation when there is any retained report or an unacknowledged edit.
The native QA bridge injects synthetic rows only for compatibility testing; this
bypass is absent from release artifacts.

## Native Android APK

Native plugins, permissions, app identity or the pinned production trust root need
a new signed APK. The candidate workflow has an independently gated signing job:

- Manual dispatch on the isolated branch, `sign_apk=true`, and repository variable
  `MT_STAGE14_SIGNING_READY=true` are all required.
- Configure the four keystore secrets in environment `maintrack-android-release`
  and require owner approval there before enabling signing. These account settings
  have not been verified or changed by this work. No key is generated here.
- Set owner-approved `MT_ANDROID_EXPECTED_CERT_SHA256` and
  `MT_ANDROID_LAST_VERSION_CODE`. The workflow checks the produced certificate and
  requires a strictly higher versionCode. Keep the same app ID/certificate for an
  in-place upgrade of an already signed installation.
- The workflow exports an APK and checksum; it does not publish or install it.
- Test upgrading the accepted signed version on an owner-controlled phone with
  synthetic queued reports, cold/offline startup and rollback before employee use.
  A temporary debug certificate is not proof of signed release upgrade compatibility;
  do not uninstall an existing app as a workaround for a certificate mismatch.

## Reproduce review artifacts

From a clean committed Stage14 checkout:

```sh
cd android/maintrack-app
npm ci --no-audit --no-fund
npm test
python3 scripts/release-candidate.py build
python3 scripts/release-candidate.py verify
```

Artifacts are unsigned and explicitly `review-only`, with rollout disabled. The
packager rebuilds `www` from the approved source and refuses unexpected QA files.
It does not publish an installable signed OTA manifest. The signed APK job does not
silently enable OTA: production trust and distribution still need a separate review.
