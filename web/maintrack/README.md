# MainTrack shared web/Android secure UI source

Immutable Stage11 reviewed secure web assets, extracted byte-for-byte from the successful locked Android APK, verified against approved-assets.lock.json.

The web preview artifact and Android lab build consume these identical sources; no Vercel production deployment occurs automatically. Do not commit credentials, OTA signing private keys or runtime session files.
