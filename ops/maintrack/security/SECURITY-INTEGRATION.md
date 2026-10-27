# Security integration candidate — review only

Base: `release/maintrack-047-final-20261024` / `54476212144c02a4d730dac5337c343691bd5a48`.

Sources: PR26 `d5a6ee7b2d1a677a7526253c7425f457f20d948d`, PR27 `b650f611ba48fdee338a23387e0fb9caef241cee`. PR25 `3b0795b8caeb1f986e7f84097a83b912f163eb08` is based on another audit tree: only its frame policy is reproduced; none of that older source/config is imported.

The historical canonical Web files and locks remain byte-identical. `prepare-security-rc.mjs` first executes the existing Final 047 builder and its strict verifier, then applies PR27's identical client logout fix to both generated shells. Backend deletes only SHA256(current opaque token). Inventory's per-request verifier sees that deletion; other sessions and token_version are unchanged. Offline/timeout/lost response clear local state immediately and explicitly remain unconfirmed, with no retry. Already-authorized in-flight server operations cannot be retroactively cancelled.

EP001 is a Web response-header policy derived from **each generated page's existing CSP**, appending only `frame-ancestors 'self'` and XFO SAMEORIGIN. It does not copy the audit branch's older CSP. Native asset hosting retains its separate navigation/transport controls; Web headers are not claimed as native response headers.

`prepare-security-qa.py --qa-shell <existing-qa-client>` creates the QA-instrumented variant from generated RC assets. It preserves QA-only transport/Keystore guards, removes external fonts/images, pins isolated QA API/Inventory paths, disables OTA, and records every asset hash/difference. It is deliberately not the operational package, signer, transport or OTA path. Existing dependencies are reused, not installed. Test credentials are synthetic fixtures only, never application resources.

Local full-shell browser tests intercept remote API URLs without forwarding them. They exercise synthetic login/logout/relogin, actual Inventory iframe/worker/search, owner/engineer/technician navigation, offline unconfirmed logout, same-origin framing and external frame rejection. They do not prove cloud authorization or database writes. Retain earlier actual QA evidence separately; it is not silently rebound to this new APK/commit.

Regression local commands use PATH or MAINTRACK_NODE. Release mode additionally calls `release_gate.py`: mandatory runtime evidence, exact source/APK/hash-bound proof, operational source provenance, independent approval and unresolved Critical/High checks. Local CI always reports release NO-GO. The proposed GitHub settings JSON is **not applied**; its evidence check/environment require separate owner configuration. No scheduled cloud tests, merge or deployment.

Operational Web provenance remains unproven: Production Vercel listing returned 403; the legacy accepted deployment metadata has no Git commit, and its file response was truncated. Operational Supabase source was readable. Do not equate an alias/project name with a verified deployment commit. Logout is not permanently deployed after QA baseline restoration.

Source comparison found one Login ordering difference: the reference invokes the shared rate guard before validating employee-code syntax; operational and restored QA validate syntax first. This candidate explicitly preserves the deployed ordering so malformed codes do not consume that shared budget. A negative test reproduced the reference behavior before the one-line correction; valid Login, issue, auth and dispatch contracts remain unchanged. No APK rebuild is needed for this server-only alignment.

Local checks:
```
python security-regression/run.py --mode local
node ops/maintrack/scripts/prepare-security-rc.mjs
node ops/maintrack/tests/security-integration.browser.mjs
python security-regression/release_gate.py --evidence reviewed-evidence.json --artifact candidate.apk --output gate.json
```
The browser command requires existing Playwright and a browser via MAINTRACK_PLAYWRIGHT_MODULE / MAINTRACK_BROWSER when not on normal discovery paths. No tool auto-install or cloud effect is permitted.
