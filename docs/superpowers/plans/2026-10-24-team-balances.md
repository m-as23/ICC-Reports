# Team Balances Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Add approved Owner Team Ledger inside existing Administration, retaining a single server balance source.
**Architecture:** Read-only PostgreSQL queries over existing journals; shared account/Owner projection; scoped reference HTML/CSS and cancellable client controller.
**Tech Stack:** Existing vanilla JS, Node tests, PostgreSQL, Playwright, current Android packaging.
**Spec:** docs/superpowers/specs/2026-10-24-team-balances-design.md

## Global Constraints
No main/Production, live writes, origin/security changes, paid AI, original signing or OTA. Preserve v046 pins and inventory assets. Reference HTML defines design; mock data never enters real services.

## Review Focus
- Deactivated accounts and forged identifiers cannot bypass verified-role checks.
- Same balance output in accountSummary and Owner across concurrent approval/adjustments.
- Missing annual setting/history is unknown rather than a fabricated 28-day allocation.
- Duplicate work dates, overnight work and cross-year leaves retain existing policy.
- Account switch, stale requests and sibling Accounts form preserve privacy and functionality.

### Task 1: CP01/02 audit and reference
- [ ] Inspect current HEAD/CI/schema/calculation paths; record verified versus blocked gates.
- [ ] Preserve uploaded reference as private test fixture and source hashes; no demo data in runtime.

### Task 2: canonical read service and candidate API
Files: ops/maintrack/team-ledger/backend/ledger-service.mjs, test/ledger.test.mjs, test/schema.sql; candidate shared-function build script.
Interface: createTeamLedger({query}) -> account(actor), team(actor,{year,query,offset,limit}), detail(actor,{employeeCode,year,kind,offset,limit}). Existing verified actor only. Canonical summary fields match current API exactly.
- [ ] RED tests for exact shared balance, half days, approved/pending/rejected, administrative adjustments, distinct dates, missing balance and role/identifier denial.
- [ ] Implement single-statement read projections and bounded pagination with no writes. Expected tests PASS using disposable PostgreSQL only.
- [ ] Prepare verified v21 candidate insertion: accountSummary delegates, Owner cases added; preserve unrelated functions/auth. No live deployment.

### Task 3: admin UI integration
Files: index.html, team-ledger.css, team-ledger.js and source frontend module; actual existing Accounts DOM wrapped unchanged.
- [ ] RED browser integration test asserting two tabs/default Accounts and no extra sidebar entry.
- [ ] Copy scoped reference layout and SVGs; wire canonical response; add async errors/retry, clear/search/year/pagination, detail tabs and audit records.
- [ ] Verify Owner-only UI and races; all existing account controls remain.

### Task 4: regression and packaging
- [ ] Run 360/390/412/600/1280 viewport browser checks, reference comparison and screenshots, account/leave/overtime/stock/regression checks appropriate to changed paths.
- [ ] Run existing source/parity locks without rewriting historical expectations; version current preview manifest explicitly if needed.
- [ ] Independent fresh whole-branch review, fix important findings RED→GREEN.

### Task 5: reviewable delivery
- [ ] Push isolated feature branch, CI, Diff and commit links. No merge to 047 or main.
- [ ] Prepare distinct static synthetic-data frontend Preview (labelled) if possible without live security changes; a truly connected Preview requires approval of the concrete candidate shared API deployment.
- [ ] Build separate QA APK if pipeline permits without protection changes; otherwise BLOCKED with exact reason.
- [ ] Update Checkpoints and stop at formal/live-service approval gate with concrete artifact and impact/rollback.
