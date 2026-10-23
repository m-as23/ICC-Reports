# Hybrid Search Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; checkbox steps track progress.

**Goal:** Add general semantic retrieval while preserving exact/literal inventory matches.
**Architecture:** Private versioned embedding cache and resumable indexing; server adapter returns verified codes; browser coordinator merges without replacing local results.
**Tech Stack:** Node, PostgreSQL/pgvector, Supabase Edge, existing HTML/JS/Capacitor.
**Spec:** docs/superpowers/specs/2026-10-23-hybrid-search-design.md

## Global Constraints
- Exact > literal > technical > semantic; semantic label «مرتبط بالمعنى».
- Fixed text-embedding-3-small / 256 dimensions; no credentials in client.
- Current approved stock only; no stock mutations by search/indexing.
- Existing isolated branch and inventory Staging only; no shared API CORS bypass.

## Review Focus
- Explicit Type K, model, units or numeric specifications cannot be silently broadened.
- Missing key/provider or unfinished indexing never hides local matches or claims semantic success.
- A changed version, logout or clear cannot append old results.
- Index retries/concurrent workers reuse cached documents and cannot mark partial data ready.
- Semantic confidence is relevance, never interchangeability or verified technical suitability.

### Task 1: Versioned semantic retrieval
Files: backend semantic-search.mjs, postgres-semantic-store.mjs, provider module, migration 003; runtime/service/entry; tests.
Interfaces: createSemanticSearch({store,index,embed,schedule,claim}).capabilities/search/warm; index claim/missing/save/finish/release/status/nearest.
- [ ] Write failing tests for general unrelated families, no lexical overlap, snapshot change, partial index, failure/retry, model/unit constraints and malicious provider vectors.
- [ ] Implement fixed provider and private resumable version index; schedule on snapshot/publish.
- [ ] Run backend suite and real disposable SQL tests including read privilege denial.

### Task 2: Non-destructive browser merge
Files: public inventory-hybrid.js, HTML/integration/approved render; Node VM and browser tests.
Interfaces: overrides search/mt6EnrichAsync, consumes MainTrackAI.search({query,signal}) returning mode/reason/codes and current snapshot.
- [ ] Write failing tests for exact code despite category inference, literal retention, semantic label, model restriction, late reply cancellation and existing filters.
- [ ] Implement same-list ranking without touching locked V9 engine; async only adds real codes.
- [ ] Run unit/browser and original engine/source/packaging guards.

### Task 3: Review and test delivery
Files: source asset lock/allowlist, QA/APK workflows and this ledger.
- [ ] Fresh whole-change review; fix important findings with tests.
- [ ] CI SQL/browser/build verification; additive Staging inventory deployment; verify health/auth.
- [ ] Validate APK source/signature, save direct download; report missing key and real quality check if still blocked.

## Execution ledger
- User explicitly requested execution twice after approving chat design; no further design approval round. Reuse existing linked isolated worktree; baseline 4 search-assist tests pass. Source base 70cf6fa.
- Pre-flight: semantic-search consumes index adapter's version/model-scoped methods; runtime passes fixed embed+background scheduler. Browser consumes only authenticated codes/mode/reason; vector data never crosses client boundary.

- Task 1/2 unit verification: 99/99 passed after fresh review fixes. Original static/hash guards and packaging parity passed. Initial CI real pgvector migration/adapter/dump-restore passed; 7/8 browser tests passed, new hybrid browser case failed awaiting first exact-code card (investigation ongoing).
- Final review: four Important findings accepted: new literal numeric boundaries; semantic contact synonyms; separated model identity; bounded index continuation. Regression tests watched RED then GREEN. Added internally authenticated inventory-only worker continuation, bounded retry/backoff, persisted error state. No shared API changes.
- Review declined live relevance/threshold/latency/device certification: retained as explicit pending verification; missing provider key prevents live relevance certification. No claim that synthetic vectors establish actual Arabic recall.
