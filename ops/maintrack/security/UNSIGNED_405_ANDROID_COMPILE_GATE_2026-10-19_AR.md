# 405 Capacitor and unsigned native pre-merge QA

The third signed Owner QA build attempt [39259310281](https://github.com/m-as23/ICC-Reports/actions/runs/39259310281) stopped **before Gradle and signing** because Capacitor generated `cordova.js` with zero bytes. The previous build [39258629603](https://github.com/m-as23/ICC-Reports/actions/runs/39258629603) independently showed `cordova_plugins.js` may also be empty. These are optional Cordova loaders in a project with no Cordova plugins. They are not MainTrack Web source assets.

The reviewed verifier permits **empty content for only** `cordova.js`, `cordova_plugins.js`, `capacitor.plugins.js`; `capacitor.js` and all canonical MainTrack HTML, JS, offline work and native-session files must remain nonempty/byte-identical as applicable. Unknown new files fail closed.

To avoid repeated production-environment signing jobs for ordinary Android build integration errors, `.github/workflows/maintrack-android-405-unsigned-ci.yml` compiles the **real unsigned 405 APK** on relevant pull requests using only `contents:read`, no signing secrets and no release environment. It validates source, exact native candidate, Gradle identity and sync hashes. It **does not upload** an installable APK or publish anything.

Only after the unsigned assembly check and combined required QA succeed, the Owner-authorized signed 0.4.5 workflow can be retried on the protected ops branch. This is still Owner QA only, and neither APK nor Web/OTA nor database updates are automatically distributed.
