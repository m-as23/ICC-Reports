# Stage 14 — explicit activation and release preparation

Employee updates remain disabled. Production and `main` are unchanged. This
follow-up builds on the accepted Stage14 laboratory rather than replacing it.

## Implemented behavior

- `createMainTrackLabUpdater()` downloads a verified candidate but never calls
  native `next()`. Backgrounding or reopening cannot apply an unarmed candidate.
- A separate user action obtains an activation lease. The controller rechecks
  signature/expiry, the unchanged data contract, pending native state, foreground
  visibility, drafts, requests and queues immediately before `set()`.
- The lease prevents new form input and requests during the native handoff. Only
  confirmation that the original bundle remains current with no pending update
  allows a rejected activation to unlock the old page. Unknown results require a
  restart; no timeout silently unlocks a potentially stale UI.
- Report queue inspection never writes, repairs, deletes or migrates `q`. It
  preserves account/`cid` identity, rejected rows and extra fields. The signed
  local-data contract accepts schema 1 with no migration only.
- Editor tracking covers reports, profile, leave, admin/employee creation,
  catalogs, work orders and passwords. Credentials and drafts are not persisted
  by this integration. It tracks all requests through the existing `post()` helper.
- Native `notifyAppReady()` waits for the actual local UI and compatible queue
  reader. It never waits for login or connectivity. Failed shell initialization
  does not acknowledge the new bundle and leaves rollback to the native updater.
- All 18 approved shared resources retain their original SHA-256 hashes.

## Confirmed automated UI results

Runtime commit: `c6ccd4a680e0cfc22ff552ff7fcd3895a8ee2b65`.
[Run 38796590638](https://github.com/m-as23/ICC-Reports/actions/runs/38796590638)
passed **47/47 Node tests and 13/13 actual UI browser scenarios**.

These cover retained reports, another account, lost acknowledgement with stable
`cid`, work created after download, activation locking and safe native refusal,
profile/leave saves, owner editors and password handling. Every external browser
request is intercepted; the backend and updater are mocks. Server-side exactly-once
delivery is not established by this suite.

## Native acceptance

Accepted on Android 35 at commit `95a770ae0262600707c1ba37cd0a2e3f9327af07`.
[Run 38823521483](https://github.com/m-as23/ICC-Reports/actions/runs/38823521483)
passed in one emulator session. The runtime is identical to `c6ccd4a`; the later
commit changes only the QA driver, shell checks and workflow native version.
Its [synthetic-data evidence](https://github.com/m-as23/ICC-Reports/actions/runs/38823521483/artifacts/12013988775)
contains device logs and a screenshot. The job also passed all 47 Node tests and
verified the 18 original resource hashes.

The reviewed job logs confirm each boundary:

| Check | Confirmed device marker |
| --- | --- |
| Actual local UI boots | `MT_BOUNDARY_ACTUAL_UI_BOOT_PASS` |
| Queued work blocks preparation, without changing queue bytes | `MT_BOUNDARY_QUEUE_GUARD_PASS_HEALTHY`, `MT_BOUNDARY_QUEUE_GUARD_PASS_FAULTY` |
| Download alone creates no pending native update; an actual tap triggers activation | `MT_BOUNDARY_READY_HEALTHY`, `MT_BOUNDARY_SET_HEALTHY` |
| Healthy version 0.3.1 starts and retains both synthetic rows exactly | `MT_BOUNDARY_HEALTHY_ACTUAL_UI_AND_QUEUE_PASS` |
| Faulty version 0.3.2 executes and fails readiness | `MT_BOUNDARY_SET_FAULTY`, `MT_BOUNDARY_FAULTY_SHELL_EXECUTED` |
| Native rollback restores healthy 0.3.1 with unchanged queue | `MT_BOUNDARY_ROLLBACK_ACTUAL_UI_AND_QUEUE_PASS` |
| Force-stop, disable Wi-Fi/data and remove lab port forwarding, then reopen | `MT_BOUNDARY_OFFLINE_RESTART_AND_QUEUE_PASS` |

This closes native preservation for the unchanged schema-1 contract, including
account/`cid`, a rejected row and an unknown extra field. It does not establish
compatibility for arbitrary future data migrations or a signed APK upgrade.

The earlier attempt [38795788933](https://github.com/m-as23/ICC-Reports/actions/runs/38795788933)
built and loaded the actual UI and downloaded the healthy bundle, but its shell
assertions used `rg`, which was absent on the runner. The driver never tapped the
activation button. This was an infrastructure failure, not successful acceptance.
The corrected script uses available `grep`, saves diagnostics even on failure and
reads the real native version for manifest compatibility.

Native test isolation: the disposable debug APK trusts only a per-job localhost TLS
certificate and has no login. The actual UI, activation controller and updater are
used. Two synthetic legacy-format rows are injected by a QA-only bridge adapter at
the native handoff to test survival through swaps and rollback. The real controller
separately refuses queued work; the injection bypass and its key/config never appear
in release candidates. No live backend is contacted.

## Review artifacts and APK path

[Candidate run 38796590404](https://github.com/m-as23/ICC-Reports/actions/runs/38796590404)
succeeded for runtime commit `c6ccd4a680e0cfc22ff552ff7fcd3895a8ee2b65`.
[Review artifact](https://github.com/m-as23/ICC-Reports/actions/runs/38796590404/artifacts/12002700635)
contains the unsigned Web/OTA archives, exact file hashes and `candidate.json` with
`rolloutEnabled:false`. The packager rebuilds from the locked source, refuses QA
files and verifies exact ZIP contents. A locally corrupted archive was rejected.

The signing job was **skipped**, as intended. A signed APK has not been produced or
tested here. Its prepared workflow requires manual dispatch, owner-managed secrets,
the named release environment, an approved certificate fingerprint and a higher
versionCode. Owner approval must be configured on that environment before enabling
signing; repository environment protection has not been verified here. Neither workflow publishes or installs anything.

Distribution details: [STAGE14_RELEASE_PATH.md](STAGE14_RELEASE_PATH.md).

## Remaining before employee rollout

1. Production trust roots and hosting/distribution must be selected and configured;
   no paid service or production URL is enabled. The controller is still lab-only,
   not wired to employee startup or a production update prompt.
2. Review backend compatibility across releases and establish real-server
   idempotency. Browser tests currently prove retries only against a mock backend.
3. Build and verify an owner-signed APK, then test an in-place upgrade on an actual
   owner-controlled phone, preserving synthetic queued work and offline startup.
4. Validate the published immutable Web path, optional pilot notification and
   recovery route before changing any production entry point. Schema-changing
   migrations need separate compatibility work and are not allowed by this OTA path.
