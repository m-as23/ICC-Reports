# Inventory cache and team numerals — isolated candidate QA

## Scope / isolation
Base `2f2b3f3` from `feature/maintrack-team-balances-from-047-20261024`; isolated branch `fix/maintrack-047-inventory-cache-numerals-20261024`. Owner authorized implementing these two fixes on 24 October 2026. No main/production merge, database write/migration, live API deployment, live CORS change, paid AI calls, employee rollout or OTA publication.

## Resulting behavior
- The existing inventory iframe survives internal navigation. Hidden inventory cancels current preparation/read requests/semantic transport and starts no new background search. Interrupted refresh resumes on return.
- One IndexedDB record stores the complete server snapshot plus prepared V9 rows, keyed to project/account/role and schema/search-engine stamp. Bearer tokens and search history are never persisted in that record. The source JSON and prepared index share one version/generation. No archive copies accumulate on the device.
- Cache restoration enables search before background verification. Identical version AND generation means no full snapshot transfer or worker rebuild. Automatic visible re-entry checks are limited to once per minute; reconnect and explicit refresh bypass that interval.
- A changed version is completely prepared and validated before replacing the old index. Recoverable failure keeps the last valid snapshot usable, visibly labeled as cached/unverified. Corrupt/unsupported/quota-limited storage falls back to authenticated loading.
- Logout, account change and server authorization denial purge the iframe and local copy. Existing MainTrack logout/session behavior remains authoritative.
- Team ledger uses `ar-EG-u-nu-latn` for counts, balances and duration, with the existing typography and values. Fixed explanatory 8/4-hour numerals match.

## Evidence
- Original focused baseline: 13 tests passed before edits.
- Cache TDD: observed failures for repeated loading, absent disk restoration, failure preservation and corrupt prepared fields; fixed tests pass.
- Numeral TDD: actual Chromium reproduced `١٢ != 12` on five viewport widths before the formatter change; all five pass afterward.
- Focused frontend/search/mail suite: 30/30 pass. Exact V9 worker/reference equivalence covers 3920 rows. Search engine, worker, hybrid rules and CSS are byte-identical to base.
- Team ledger API/calculation/immutability regressions on disposable PostgreSQL WASM: 17/17 pass, no live employee data.
- Actual inventory host/iframe/IndexedDB/worker browser scenarios: 9/9 pass, including offline reopen, no-redownload navigation, version-generation replacement, account/logout purge, auth denial from semantic transport, corrupt storage and unavailable IndexedDB.
- Previous inventory loading/worker/error/race browser regressions: 9/9 pass.
- Team ledger placement/detail/responsiveness: 5/5 widths (360,390,412,600,1280). Full existing host with synthetic transport: 2/2 phone/desktop flows pass. Sidebar role/navigation regression: 1/1 matrix passes.
- Android/session/OTA/queue/update safety suite: 107/107 pass; historical shared-source pin is intentionally tested on immutable 046 in existing legacy CI, while this candidate has separate exact Web/native parity.
- Web/native asset preparation, manifest and tamper rejection: 1/1 pass. Native 407 identity/downgrade/signer guard: 1/1 pass.
- Static syntax/menu/duration checks and whitespace check pass. Supabase source, core report/account/session scripts, old HTML root and historic locks remain unchanged.

## Lab measurements / limits
Synthetic 3920-row Chromium 133 lab, not an Oppo handset benchmark: warm sidebar return measured 75–186ms in observed runs (includes browser automation overhead), with zero new snapshot downloads or workers within the automatic check interval. Lab IndexedDB usage estimate: 180385 bytes for highly repetitive synthetic records; this does NOT predict real stock storage size. JS heap after GC: 5288188 bytes before and 5421672 after ten returns (133484-byte difference); no repeated stock copies/downloads observed. Device memory/disk, Android WebView behavior and real slow-network acceptance still require the isolated installed build on the handset.

Official Playwright browser CDN download was unavailable in this environment; local browser checks used npm-pinned @sparticuz/chromium 133.0.0 as a test-only runtime. No application dependency or lockfile changed.

## Independent review
Fresh read-only reviewer identified four P2 issues: incomplete prepared-cache validation; auth denial outside the loader not purging cache; semantic cancellation not reaching transport; interrupted refresh delayed by the throttle. Each was corrected and covered by regression tests. The interrupted-refresh test was also run with the fix removed and timed out as expected, then passed with the fix restored. No remaining reported review findings.

## Review and release boundary
A separate synthetic-data preview was prepared locally and verified in the full-host browser tests. Vercel deployment was attempted but returned 403: the connection cannot create a project or a Preview deployment on the existing review project. No Vercel CLI is installed/authenticated for a fallback, no preview was created, and no alias moved. The approved existing staging URL and installed APK remain untouched. Shared Web/native assets are prepared and verified, but no APK binary/physical-device installation or production release is claimed. Ready for isolated candidate review; handset acceptance and exact live-origin approval precede adoption.

## GitHub CI follow-up
Implementation commit `1da8a498f489e893c0663f5d35f4b7ac4cc04b1f`, draft PR #24 targets the unchanged team-ledger branch. Initial change QA gate passed. Actual-candidate cache/numeral browser job, syntax/ledger/import/source job and disposable PostgreSQL job passed. The broader legacy browser job exposed an obsolete synthetic fixture: inventoryVersion omitted generation while inventorySnapshot included it. The real API returns generation. The fixture now mirrors the real contract and uses explicit refresh for its immediate version-change test, preserving product throttling and strict version+generation validation. All five inventory reference/hybrid flows plus the mobile Save-clearance regression pass locally afterward (6/6); no product code changed in this follow-up.
