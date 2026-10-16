# MainTrack Update Lab — personal-device APK pair

## Scope and continuity

The user previously installed/tested Stage11 Debug v0.2.0. Its retained Actions
artifacts contain the APK and review locks, not its temporary signing keystore.
Consequently these new Debug APKs use a separate install identity,
`com.icc.maintrack.updatelab`, named **MainTrack Update Lab**. They coexist with the
existing MainTrack installation and do not migrate or remove its local storage.
They are not employee Release APKs and do not establish permanent release signing.

Both new APKs are built together with one temporary Debug signing key. Certificate,
actual package ID, versionCode and versionName are checked from the resulting APKs.
The private key is not exported. The pair supports this complete laboratory path:

| Step | Version | Mechanism |
| --- | --- | --- |
| Initial installation | native/UI 0.3.0, code 300 | `MainTrack_UpdateLab_v0.3.0.apk` |
| Compatible UI update | UI 0.3.1, native stays 0.3.0 | User check, download, activate |
| Native APK upgrade | native/UI 0.3.2, code 302 | `MainTrack_UpdateLab_v0.3.2.apk`, in place |

## Public update fixture

The public-only config lives in `qa/stage15-device/public-config.json`. Its lab key
is pinned into the opt-in UI bundle. The signed manifest is fetched from the same
feature branch on GitHub's public raw HTTPS host; the ZIP URL is pinned to immutable
commit `93c1564f93a2e7bf2bbde24536c60c424bc6f56c`. Signature, checksum, byte count,
expiry, native range and unchanged queue contract are checked. The live endpoint
and immutable ZIP bytes were fetched and checked before the Android run.

GitHub raw serves JSON as `text/plain`; the transport accepts that MIME type only
on that exact HTTPS origin. Other hosts still require JSON. Signature verification
is unchanged. Requests omit credentials, reject redirects and limit response bytes.
The disposable OTA private key was removed immediately after signing; no production
key or paid hosting service was provisioned. Manifest expiry is
**2026-10-22 09:54:40 UTC / 12:54:40 Africa/Cairo**. After expiry, the installed app
continues but this lab update cannot be activated without a newly approved test.

## User test order

1. Install **v0.3.0** first. Find **MainTrack Update Lab** beside the existing app.
   Login is not needed for the update experiment.
2. Open **تحديثات التطبيق**, then **التحقق من تحديث**. It should show current 0.3.0
   and available 0.3.1. Download, then explicitly activate. Unsaved work or retained
   reports defer this operation.
3. After reload, open the panel and check again: current UI 0.3.1 and no newer UI
   release. Android system app info still shows native 0.3.0; OTA changes Web UI.
4. Only then install **v0.3.2** above this Lab app, using the second APK. This tests
   native upgrade without uninstalling. Its application ID and certificate match
   the base Lab APK; its versionCode is higher.

The original MainTrack app remains a separate installation. Do not uninstall it as
part of this experiment. Real-owner phone acceptance has not been claimed in CI.

## Acceptance evidence

Accepted using the **exact same APK bytes** built at
`8103a8eedbe4dc5e5e393cd1dfa6bc596d87c9db`.
[Run 38886730712](https://github.com/m-as23/ICC-Reports/actions/runs/38886730712)
at test commit `ba384786ec585447b5fc7fe92ddfdc86f6c50edc` succeeded.
Reviewed logs contain all four markers:

- `MT_DEVICE_LAB_OTA_030_TO_031_PASS`
- `MT_DEVICE_LAB_DURABLE_QUEUE_BEFORE_APK_PASS`
- `MT_DEVICE_LAB_APK_032_UPGRADE_AND_QUEUE_PASS`
- `MT_DEVICE_LAB_OFFLINE_RESTART_AND_QUEUE_PASS`

[Accepted APK artifact](https://github.com/m-as23/ICC-Reports/actions/runs/38886730712/artifacts/12039783939)
and [synthetic device evidence](https://github.com/m-as23/ICC-Reports/actions/runs/38886730712/artifacts/12039951605)
retain the pair, provenance/checksums and screenshots/phase results. The accepted
recheck downloads the prior build artifact and verifies its pinned SHA-256 values,
so no new certificate or native rebuild was introduced by the test corrections.
The actual device screenshot after OTA was visually reviewed. Both APKs' 22 Web
assets were also compared byte-for-byte with the immutable OTA ZIP.

| File | SHA-256 |
| --- | --- |
| `MainTrack_UpdateLab_v0.3.0.apk` | `85e234fa33691e987b49668f699cbadc20ba3757ffa5fc401997fb210db4fe0d` |
| `MainTrack_UpdateLab_v0.3.2.apk` | `6af562a64b5fb5f15c19924183fbbd9f432306d64a1bc8a51704cb8480626611` |

Shared Debug certificate SHA-256:
`dfeaf137f3db0f5f04183288898336b93435d65badeb47a99d7e5e6588eee6c4`.
Sizes are 6,850,697 and 6,850,693 bytes respectively. Permanent Release signing is
not established by this temporary certificate.

The source change also passed **55/55 Node and 16/16 browser scenarios** in
[run 38883595926](https://github.com/m-as23/ICC-Reports/actions/runs/38883595926).
The original 18 shared resource hashes remain unchanged.

The new build workflow is
`.github/workflows/maintrack-stage15-personal-apk.yml`. It builds both files and
checks them in one Android35 emulator session: real public-manifest download,
actual user-control activation, queued-work refusal, a surviving synthetic sentinel,
in-place APK upgrade with exact synthetic queue preservation, and offline restart.
No account is used. Test WebView requests outside localhost and the public update
host are blocked after attachment; no live backend operation is performed.

APKs are exported only after that acceptance step passes. The artifact includes
`delivery.json` with hashes, source commit, certificate fingerprint and expiry.
Default candidates and production remain unenrolled and unchanged.


## Observed durability boundary and test corrections

An initial script injected a synthetic `q` row immediately before `adb install -r`.
After upgrade its last write was absent (`q` was the earlier `[]`), while an older
sentinel remained. No user account or real report was involved. This observation
must not be hidden by claiming unconditional localStorage crash durability.

The accepted experiment gives the synthetic write six seconds in the foreground,
force-stops/reopens the **old** app, verifies its exact queue bytes, and only then
installs the new APK. It proves preservation of that already-durable queue through
an actual in-place APK upgrade and another offline restart. It does not prove
survival of a last-millisecond write during forced process termination. A durable
outbox/checkpoint and guided native-upgrade boundary remain employee-release work.
Use synthetic data for this personal-device lab.

Other initial attempts stopped at test infrastructure: a working-directory error,
a readiness predicate returning a thenable plugin Proxy instead of a boolean, and
background DevTools callbacks. None is counted as acceptance. Subsequent checks
reuse identical APKs, with complete local-shell flags and failure diagnostics.
