# Stage 14 actual UI local-work regression

This suite loads the approved MainTrack UI emitted by `scripts/snapshot.mjs`.
The shared source and its SHA-256 lock remain unchanged. The native build adds a
read-only local-work reader after the existing application script. The lab update
integration verifies the signed manifest and consults this reader before download
and before scheduling. It is not connected to employee OTA startup.

## Run

From `android/maintrack-app`:

```sh
npm ci --no-audit --no-fund
npm test
npm run build:web
cd tests-browser
npm ci --no-audit --no-fund
npx playwright install --with-deps chromium
npm test
```

The test server binds to `127.0.0.1` on an ephemeral port. All external requests
are intercepted: the existing API URL returns an in-memory mock response, other
external requests are aborted. No user login, report, database, or deployment is
used. The native updater is also a mock; no ZIP download, install, or emulator is
performed here. `harness-entry.mjs` is served only by the test server and is never
included by `snapshot.mjs`.

## Accepted scope

- Actual form submission stores the existing `q` array with account `u` and `cid`.
- Pending, rejected, other-account, corrupt, and unreadable queues defer OTA.
- A hidden report draft or active submission defers OTA.
- A report survives closing the page and reopening it in the same browser context;
  the fresh tab must sign in again before resuming delivery.
- Concurrent resend does not create a second submit request while the first is
  pending; the row is removed only after the mock's successful response.
- A lost acknowledgement retains the queue and retry keeps the original `cid`.
  The mock backend deduplicates by account + `cid`. This is not proof of the live
  backend's idempotency or an unconditional exactly-once delivery guarantee.
- A report arriving during download prevents scheduling. Invalid signatures or
  unavailable runtime state cannot enable an update.

This suite does not force an OTA while a report is queued. It verifies that the
guard prevents that switch. The separate Stage 14 Android run proves localStorage
sentinel persistence through native swap and rollback. Real queued-data schema
migration and signed Release APK/device acceptance remain separate release gates.
