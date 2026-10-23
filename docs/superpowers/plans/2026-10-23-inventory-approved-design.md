# Approved Inventory Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved compact/empty inventory views and Owner version management on matching Web/APK.
**Architecture:** Preserve original V9 search/measurement engine and isolated HTML page. Add narrowly scoped presentation overrides, authenticated version/audit APIs, optional server-only search expansion.
**Tech Stack:** HTML/CSS/JS, Node tests/Playwright, PostgreSQL, Supabase Edge, Capacitor Android.
**Spec:** docs/superpowers/specs/2026-10-23-inventory-approved-design.md

## Global Constraints
- Cairo AM/PM freshness label «آخر تحديث لرصيد قطع الغيار»; no filename for readers.
- Whole-file uploads only; no individual item edits/deletions.
- Owner-only version actions; keep archived files, no current-version exclusion.
- No main/Production/OTA changes; use existing feature branch and isolated test APK.

## Review Focus
- Empty, failed-load and no-match states differ; placeholders never masquerade as real stock.
- Account/version changes invalidate old details, cloud responses and publish receipts.
- Exclusion races against publication; current version cannot be excluded.
- All archive/activity pages accessible; excluded versions retain audit history.
- Missing AI configuration or provider failure never displays cloud success or invents inventory.

### Task 1: Approved views
Files: inventory-reference.html/css/integration.js, inventory-approved.css, reference-source.json, static/browser tests.
Consumes original V9 functions; produces compact renderResults and empty-state interactions.
- [x] Write browser assertions for exact freshness copy, absent filename, empty state and limit-switch example; watch old UI fail.
- [x] Implement approved presentation; keep original engine untouched using a separate presentation script.
- [x] Verify card safe-text rendering, details, filters, clear/search, mobile/desktop and all roles.

### Task 2: Owner versions
Files: backend store/service/domain/http tests, additive SQL migration, client/host bridge, Owner dialog.
Interfaces: inventoryVersions({offset,limit,includeExcluded}), inventoryActivity({offset,limit}), inventoryExcludeVersion({versionId,expectedCurrentId,confirm}), inventoryReinstateVersion(same). Paginated responses {items,hasMore,nextOffset}; restores use existing receipt-bound review then explicit publish.
- [x] Write failing permission/store tests including current-version exclusion/race.
- [x] Implement additive excluded_at/by columns, audit events and transactional actions; never delete stored stock.
- [x] Render latest 3, archive pages, actor/time/action history and explicit actions; test server denies spoofed readers.

### Task 3: Search capability and release
Files: optional provider adapter, entry/service/client/bridge tests, CSS/engine source locks, packaging/workflows.
Interfaces: inventorySearchCapabilities() and inventorySearchAssist({query,versionId}); server key only, query-only external request, bounded timeout, validated real codes from approved snapshot.
- [x] Write failure/fallback/stale/version/unit tests before adapter changes.
- [x] Implement optional configured provider; truthful local mode if unavailable, no fabricated AI claim.
- [x] Run focused/unit, disposable PostgreSQL, browser regression; fresh whole-change review and fix important findings.
- [ ] Complete new Web CORS activation (blocked by auto-review; APK and inventory API delivery complete).

## Execution ledger
- User explicitly approved designs and requested execution; proceed inline without another approval round.
- Existing isolated feature worktree reused. Stock publication tests use synthetic data only.

## Verification and delivery — 2026-10-23
- Implementation commit: 5dbef6e461c39a91759cb8202fa80ea71a85192e.
- Focused local suite: 83 passed, 0 failed; original engine/CSS hash guard and packaging parity passed.
- CI 39936609821: all isolated SQL, auth, source, browser jobs passed. Seven browser tests passed, including approved empty/compact UI for Owner/technician at 390/1280px, version review/exclusion/activity and mobile navigation.
- Fresh reviewer identified missing totalCount startup dependency and excluded restore-source publish race; both fixed, plus archive loading, cloud notice and job title minor fixes.
- CI 39936609832 built signed APK com.icc.maintrack.preview047r5, version 0.4.7 (407). All 29 native assets matched the prepared commit; v2/v3 signature verified by build tools. Device installation not run.
- APK SHA-256: 48ceaa3d43a01b7a70d22df543ed490fa8e339375f9f28956d0485a1b8dc5ed8.
- Inventory API v10 ACTIVE. Additive Owner migration applied; no inventory version uploaded or published by this task. Health 200; new preview-origin OPTIONS 204; unauthenticated stock read 401.
- Optional cloud expansion is wired but OPENAI_API_KEY is absent. Live capability false and UI truthfully displays technical search.
- Prepared Web deployment dpl_EseevBYmwVtvdcT3DzWQrssVKLsx READY at https://maintrack-final-security-mkupyiv11-mohamedashrefsrag-5918.vercel.app . It is NOT ready for user login: unified API OPTIONS returns 403 ORIGIN_FORBIDDEN.
- Auto-review rejected adding that exact new origin to shared maintrack-unified-four-qa v19 twice, including after byte-equality proof that only a 79-character CORS-set insertion differed. Reason: persistent trust-boundary modification needs explicit approval for the shared API. No workaround attempted. User approval remains required to finish new Web activation.
- Existing Web link remains the previous release. New APK uses the allowed native localhost origin and installs beside earlier previews. It is saved as MainTrack-0.4.7-APPROVED-DESIGN.apk for download.
