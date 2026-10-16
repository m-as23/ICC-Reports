# MainTrack — opt-in update panel after Stage 14 acceptance

## Personal-device build follow-up

The [accepted Debug APK pair](STAGE15_PERSONAL_DEVICE_APK.md) now provides a real
public-hosted OTA and native APK-upgrade experiment beside the original app.
Its report is authoritative for deliverable versions, hashes and observed durability
limits. Production/employee Release gates remain open.

## Continuity

This extends the accepted Stage14 activation controller on
`android/stage14-ota-native-lab`. The user already installed and exercised
`MainTrack_Stage11_Debug_Locked_v0.2.0.apk` on 2026-10-15: account switching,
report creation and department creation passed their initial trial. That APK was
explicitly Debug. Do not ask again whether an APK has ever been built or tried.
Permanent signed Release distribution remains a separate gate.

## Implemented

- An Arabic update panel exposes check, download, explicit activation and close.
  Merely loading the app or opening the panel makes no update request.
- Only a build-time pinned HTTPS manifest URL/public key/origin list is accepted.
  This remains the existing `lab` channel, not a production OTA enrollment.
- Manifest fetch omits credentials, refuses redirects, has a 3-second fetch/body
  timeout and limits streamed bytes to 16 KiB. Invalid signatures, expiry,
  incompatible native versions or changed queue contracts cannot enable download.
- Already-installed or older signed versions are not offered. Native fallback to
  the last good version remains the plugin's independent readiness mechanism.
- Download uses the accepted controller; it never arms `next()` or reloads.
  Explicit activation calls the controller synchronously within the user's click.
  New edits, retained reports, active requests, unknown state or loss of visibility
  defer activation. Native handoff keeps the existing maintenance lock.
- Application CSS/security policy remains enforced. The panel stylesheet is external;
  generated pilot HTML adds only the configured manifest origin to `connect-src`.
  The original 18 shared resources are not edited.

## Opt-in build

Standard snapshots and review candidates do not import this panel. To prepare a
separate laboratory build, provide a public-only JSON file outside the repo:

```json
{
  "schema": 1,
  "channel": "lab",
  "manifestUrl": "https://YOUR-APPROVED-LAB-HOST/release.json",
  "allowedOrigins": ["https://YOUR-APPROVED-LAB-HOST"],
  "publicKeyBase64": "REPLACE_WITH_APPROVED_32_BYTE_ED25519_BASE64URL_PUBLIC_KEY"
}
```

The placeholders intentionally fail validation; no server/key is silently chosen.
From `android/maintrack-app`:

```sh
node scripts/prepare-pilot-ui.mjs --config /absolute/path/to/public-pilot.json
```

This rebuilds the locked source and emits the opt-in panel JS/CSS into ignored
`www`. It does not build/sign/install an APK or publish a host. A subsequent ordinary
`build:web` restores the standard snapshot. Ordinary release packaging rebuilds its
own snapshot and cannot accidentally include the pilot UI/configuration.

## Verification scope

Seven new Node scenarios cover separate actions, signed downgrade rejection,
untrusted signatures/contracts, edits and expiry at activation, retained reports,
bounded transport and fixed HTTPS configuration. The total is 54 Node tests.
`check-pilot-build.mjs` compiles a disposable public-only configuration, checks the
emitted entry/CSP and restores the standard snapshot. No private signing key is
written by that build check.

Three new actual-UI browser scenarios exercise the visible controls, protected
activation after new work, untouched retained reports and rejection of an untrusted
release. Their endpoint and native bridge are intercepted/mocked; no live backend,
OTA host or Android emulator is used. Existing 13 browser scenarios remain in the
same regression suite.

Confirmed at `5053b2ac162f644cc6806719e3060dbac8a97425`:
[run 38869140630](https://github.com/m-as23/ICC-Reports/actions/runs/38869140630)
passed **54/54 Node tests and 16/16 actual UI browser scenarios**, plus the opt-in
build smoke check and the 18 original resource hashes. Job logs were reviewed.
The [evidence artifact](https://github.com/m-as23/ICC-Reports/actions/runs/38869140630/artifacts/12032233804)
contains scenario results and the synthetic-account panel screenshot. The screenshot
was visually reviewed. Two initial new browser assertions were corrected to open
the report tab before typing; no runtime changes were needed for that correction.

[Candidate run 38868910980](https://github.com/m-as23/ICC-Reports/actions/runs/38868910980)
also passed 9 release checks and 54 Node tests. It packages the standard snapshot,
not an enrolled pilot/employee build; its signing job remained skipped. The runtime
at that run (`3cb170e`) is identical to the accepted UI run above.

## Remaining release gates

The update panel has not been deployed to employees or installed on the user's
phone. Production channel/trust, hosting, permanent APK signing and in-place
physical-device upgrade remain in the existing release plan. The known Vercel
project-settings access failure and unavailable GitHub secrets administration are
not resolved by adding this UI. See [pilot handoff](STAGE14_PILOT_HANDOFF.md) and
[accepted native evidence](STAGE14_ACTIVATION_ACCEPTANCE.md).
