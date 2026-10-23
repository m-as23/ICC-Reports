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
- [ ] Write browser assertions for exact freshness copy, absent filename, empty state and limit-switch example; watch old UI fail.
- [ ] Implement approved presentation; keep original engine untouched using a separate presentation script.
- [ ] Verify card safe-text rendering, details, filters, clear/search, mobile/desktop and all roles.

### Task 2: Owner versions
Files: backend store/service/domain/http tests, additive SQL migration, client/host bridge, Owner dialog.
Interfaces: inventoryVersions({offset,limit,includeExcluded}), inventoryActivity({offset,limit}), inventoryExcludeVersion({versionId,expectedCurrentId,confirm}), inventoryReinstateVersion(same). Paginated responses {items,hasMore,nextOffset}; restores use existing receipt-bound review then explicit publish.
- [ ] Write failing permission/store tests including current-version exclusion/race.
- [ ] Implement additive excluded_at/by columns, audit events and transactional actions; never delete stored stock.
- [ ] Render latest 3, archive pages, actor/time/action history and explicit actions; test server denies spoofed readers.

### Task 3: Search capability and release
Files: optional provider adapter, entry/service/client/bridge tests, CSS/engine source locks, packaging/workflows.
Interfaces: inventorySearchCapabilities() and inventorySearchAssist({query,versionId}); server key only, query-only external request, bounded timeout, validated real codes from approved snapshot.
- [ ] Write failure/fallback/stale/version/unit tests before adapter changes.
- [ ] Implement optional configured provider; truthful local mode if unavailable, no fabricated AI claim.
- [ ] Run focused/unit, disposable PostgreSQL, browser regression; fresh whole-change review and fix important findings.
- [ ] Deploy staging API/Web, verify source bytes/CORS, build isolated APK and verify matching assets/signature; save direct APK link.

## Execution ledger
- User explicitly approved designs and requested execution; proceed inline without another approval round.
- Existing isolated feature worktree reused. Stock publication tests use synthetic data only.
