# Inventory cache and team numeral implementation plan

**Goal:** Remove repeated inventory preparation while preserving approved search/stock semantics, and use 0–9 in the approved team ledger.

**Authorization/spec:** Owner approved the discussed version-keyed local copy and numeral correction on 2026-10-24, requested immediate execution on an isolated candidate. Base: `2f2b3f3` (latest team ledger branch). No main/production merge, database writes, shared backend deployment, or OTA publication.

**Architecture:** Keep the existing iframe mounted while hidden, suspend hidden-page remote work, clear it and the single local cache on logout/account change. Store one complete validated snapshot and prepared index in IndexedDB (schema/search-engine stamp, project/account scope, no token). Restore it before background version/generation validation; download and prepare only changed inventory. Preserve valid old rows during recoverable refresh failure, visibly label cached/offline data, clear on authorization denial. Complete updates replace the whole index; existing worker and search functions stay authoritative.

**Tech Stack:** Existing JavaScript modules, esbuild, browser IndexedDB, Node test runner, Playwright, unchanged Supabase APIs.

## Constraints and review focus
- Preserve original search engine/CSS, Owner import/diff/approval guards, reports/account/API/session implementations.
- Retain only one local record; never persist bearer tokens or user search history.
- Prevent old-account delayed work/cache writes from reappearing after logout.
- Same inventory version AND generation means no snapshot download or worker preparation on re-entry.
- Failed/corrupt/unsupported storage must fall back to authenticated load; partial cache must never enable a partial index.
- Cached data remains visibly distinguished from successful online freshness checks.

## Task 1: Cache lifecycle
- [x] Reproduce repeated mount/teardown and missing persistence with failing unit/browser tests.
- [x] Add single-record, bounded, schema-stamped IndexedDB adapter and loader cache restore/background revalidation.
- [x] Retain iframe while hidden, suspend network work, cancel stale searches and clear data on session change.
- [x] Verify unchanged-version no-download, changed-version atomic replace, offline retry, auth failure, races, corrupt/quota storage, account switch, 3920-row search parity.

## Task 2: Team numerals
- [x] Assert visible counts, fractions, detail durations and year all use Latin 0–9.
- [x] Use `ar-EG-u-nu-latn`, preserve Cairo and all values/layout/business rules, synchronize canonical/source copies.
- [x] Verify narrow and desktop layout, ledger/account tab navigation and unchanged balance computation tests.

## Task 3: Candidate verification and review
- [x] Regenerate bundles and exact candidate asset manifest, keep historical locks untouched; extend scoped QA routing to this exact branch.
- [x] Run focused Node/browser regressions, native/session/OTA safety tests and shared Web/native preparation parity.
- [x] Independent whole-change review; resolve important findings and rerun affected checks.
- [x] Commit/push isolated branch and draft PR against the team-ledger base (PR #24).
- [ ] Deploy a separate synthetic-data preview and inspect served assets: BLOCKED by Vercel connection permissions (403 for project creation and Preview deployment on the existing review project). CLI fallback is unavailable. No deployment was created or alias moved.

Progress and measured limitations are recorded in `audit-output/cache-numerals-progress.md` and the committed QA report.
