# Owner-held signing setup

Status: setup tool prepared and locally verified with disposable test keys only.
No permanent key, GitHub Secret, APK, or OTA release has been created by this step.

Run `android/maintrack-app/scripts/setup-owner-signing.py` on the owner's computer
with Python 3, Java `keytool`, and OpenSSL installed. Keep the backup outside every
Git checkout, in a private directory on an encrypted disk. Do not upload its files
to a chat, commit, build artifact, or public download. Keep a second protected copy.

For local backup generation only:

```sh
python3 android/maintrack-app/scripts/setup-owner-signing.py --backup-dir "$HOME/MainTrack-signing-backup"
```

To generate and provision secrets in the same initial run, install and sign into
GitHub CLI with repository/environment Secrets management access first. The
`maintrack-android-release` GitHub environment must already exist. Add
`--publish-secrets` to the command above. The tool verifies access before generating
keys and refuses to overwrite existing MainTrack secrets or an existing backup.
Do not run the generation-only command first if using this combined mode.

The backup includes a PKCS12 Android keystore, encrypted Ed25519 OTA private key,
private recovery passwords, and public fingerprints. Passwords are sent to tools
through environment variables/stdin, not shell command arguments or logs.

The combined mode provisions four Android signing secrets plus
`MT_OTA_PRIVATE_KEY_PEM` and `MT_OTA_PRIVATE_KEY_PASSWORD`, and sets the public
certificate fingerprint variable. It does not set signing readiness or an assumed
last-installed versionCode, change protection rules, dispatch builds, or enable
OTA. The current OTA publisher does not yet consume these new OTA secrets.

If a network failure interrupts provisioning, retain the generated backup and
complete provisioning from those same keys. Do not delete the backup or generate
new keys to retry; the tool deliberately refuses such replacement. Review partial
Secrets setup before proceeding.

A new signing identity cannot upgrade the old disposable Debug lab APK in place.
Do not uninstall existing MainTrack or erase its queued reports as part of setup.
An installation/migration decision and a new OTA trust configuration are required
before device delivery can be claimed.

Verification performed: actual generated PKCS12 matched the existing
`release-preflight.py` certificate/private-key checks; OTA public key shape passed;
backup file permissions were private; duplicate-directory generation was refused;
passwords were absent from stdout. No GitHub provisioning or device test was run.
