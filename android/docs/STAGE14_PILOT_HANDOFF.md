# MainTrack — signed pilot preparation

## Verified state on 2026-10-16

- Branch: `android/stage14-ota-native-lab`; app ID: `com.icc.maintrack`.
- Local storage origin remains `https://localhost`; employee OTA remains off.
- The accepted runtime and its 18 locked shared resources are unchanged by this
  release preparation. See [native acceptance](STAGE14_ACTIVATION_ACCEPTANCE.md).
- Vercel lists `maintrack-final-security-qa` (`prj_7l6q0Qx7vV7K5LP52MUNXjBOD3ZQ`)
  under team `team_gw1E3m9dOLSi9YgupIlh5Xy1`. Reading project settings returned
  **403**. No Vercel CLI with independent access is available here. Listing a project
  does not establish permission to inspect or deploy. No deployment/alias changed.
- The GitHub connector does not expose secrets/environment administration. Owner
  signing secrets and required reviewers are **unknown**, not confirmed absent.
  No permanent private key was created or requested in chat.

## Prepared and checked

`release-preflight.py` runs before SDK installation and Android compilation. It
requires the isolated branch and exact event commit, expected app ID/local origin,
disabled OTA, increasing integer versionCode, approved certificate SHA-256 and all
four signing inputs. It exports the certificate in a temporary directory and checks
its fingerprint; a disposable CSR verifies private-key/password usability. These
operations capture diagnostics without printing secret values. Temporary key
material is removed on normal completion or handled failure.

After signing, the workflow verifies the APK signature, app ID and version from the
APK itself. It exports `release-provenance.json` with source commit, app/version,
certificate fingerprint and APK checksum. This signed-build path has not yet run
with an owner key and is not an accepted signed APK.

`prepare-web-preview.py` verifies both candidate archives, requires their expected
source commit and refuses to overwrite existing output. It emits a static Vercel
Build Output API v3 package containing exact candidate Web bytes under
`/releases/<commit>/`, an uncached entry redirect, immutable version resources and
an uncached `/review.json`. Response-header CSP blocks the live backend and form
submissions. No hosting credentials or project binding are included.

The preview is for UI/distribution review only: it cannot log in or submit reports
to the actual backend. CDN headers, redirect/query-string behavior, browser CSP and
the deployed recovery route require a Preview smoke test after access is restored.
Unit checks of generated configuration are not that deployment test.

Nine short release tests passed locally, including a real ephemeral JKS key with
correct/incorrect passwords, wrong certificate and missing alias, plus app/branch/
version rejection and corrupt archive/overwrite rejection. No Android emulator
test was repeated for these tooling changes.

## Owner signing prerequisites

1. Establish whether a signed MainTrack APK is already installed or distributed.
   If so, retain its **same signing key**, app ID and a higher versionCode. A debug
   build does not establish the permanent release identity. Do not uninstall an
   existing installation to work around a certificate mismatch.
2. If no release identity exists, create the permanent keystore on an owner-controlled
   computer and keep a secure backup. An interactive example (JDK `keytool` required)
   follows. Run it outside the repository and use a new file, not an existing key.

   ```sh
   keytool -genkeypair -keystore maintrack-release.p12 -storetype PKCS12 \
     -alias maintrack -keyalg RSA -keysize 3072 -validity 10000
   keytool -list -v -keystore maintrack-release.p12 -alias maintrack
   ```

   Enter passwords locally at prompts. Record the public SHA-256 certificate
   fingerprint; the PKCS12 key password is normally the store password. Do not send
   the keystore, its Base64 encoding or passwords in chat or commit them to Git.
3. Configure GitHub environment `maintrack-android-release` with required owner
   review of the exact commit and restrict deployment to this feature branch.
   Put these values in **environment secrets**, never in code:

   | Secret | Owner-provided value |
   | --- | --- |
   | `MT_ANDROID_KEYSTORE_BASE64` | Base64 encoding of the backed-up permanent keystore |
   | `MT_ANDROID_KEYSTORE_PASSWORD` | Keystore password |
   | `MT_ANDROID_KEY_ALIAS` | Existing signing alias |
   | `MT_ANDROID_KEY_PASSWORD` | Private-key password |

4. Set `MT_ANDROID_EXPECTED_CERT_SHA256` and `MT_ANDROID_LAST_VERSION_CODE` as
   environment variables. The latter is the highest distributed versionCode; use
   `0` only for a genuinely first signed release. Set the **repository variable**
   `MT_STAGE14_SIGNING_READY=true` only after those prerequisites and review gates
   are in place. It unlocks the manual signing condition, never employee OTA.
5. Review the feature-branch commit and deliberately dispatch the candidate workflow
   with `sign_apk=true`, `version_code` above the approved last version and the
   desired `version_name`. Do not merge into `main` to expose a dispatch button.
   GitHub dispatch availability/permissions must be confirmed before scheduling it;
   this connector has no dispatch operation. Ordinary pushes only package unsigned
   review candidates.
6. On success, compare exported provenance to the intended commit/certificate.
   Install and then upgrade in place on the owner's phone using synthetic records;
   check data, login/session behavior, offline startup and resume before a pilot.
   Owner-device installation and release-upgrade acceptance remain pending.

## Preview handoff

Restore Vercel access to the recorded team/project or explicitly select another
isolated preview project. Re-read settings before deployment; do not use a different
default scope or alter the production alias. The prepared artifact contains
`web-preview/maintrack-web-preview.zip` and a checksum alongside `release-candidate/`.
Extract the preview ZIP into an empty deployment directory: it includes
`.vercel/output/config.json` and static files, but no project link or credentials.
Only an explicitly selected **Preview** target may be used for this pilot.

References: [Vercel Build Output API](https://vercel.com/docs/build-output-api/configuration),
[JDK keytool](https://docs.oracle.com/en/java/javase/21/docs/specs/man/keytool.html),
[GitHub manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
