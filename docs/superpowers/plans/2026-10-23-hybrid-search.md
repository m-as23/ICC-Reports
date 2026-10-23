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
- [x] Write failing tests for general unrelated families, no lexical overlap, snapshot change, partial index, failure/retry, model/unit constraints and malicious provider vectors.
- [x] Implement fixed provider and private resumable version index; schedule on snapshot/publish.
- [x] Run backend suite and real disposable SQL tests including read privilege denial.

### Task 2: Non-destructive browser merge
Files: public inventory-hybrid.js, HTML/integration/approved render; Node VM and browser tests.
Interfaces: overrides search/mt6EnrichAsync, consumes MainTrackAI.search({query,signal}) returning mode/reason/codes and current snapshot.
- [x] Write failing tests for exact code despite category inference, literal retention, semantic label, model restriction, late reply cancellation and existing filters.
- [x] Implement same-list ranking without touching locked V9 engine; async only adds real codes.
- [x] Run unit/browser and original engine/source/packaging guards.

### Task 3: Review and test delivery
Files: source asset lock/allowlist, QA/APK workflows and this ledger.
- [x] Fresh whole-change review; fix important findings with tests.
- [x] CI SQL/browser/build verification; additive Staging inventory deployment; verify health/auth.
- [x] Validate APK source/signature, save direct download; report missing key and real quality check if still blocked.

## Execution ledger
- User explicitly requested execution twice after approving chat design; no further design approval round. Reuse existing linked isolated worktree; baseline 4 search-assist tests pass. Source base 70cf6fa.
- Pre-flight: semantic-search consumes index adapter's version/model-scoped methods; runtime passes fixed embed+background scheduler. Browser consumes only authenticated codes/mode/reason; vector data never crosses client boundary.

- Task 1/2 unit verification: 99/99 passed after fresh review fixes. Original static/hash guards and packaging parity passed. Initial CI real pgvector migration/adapter/dump-restore passed; 7/8 browser tests passed, new hybrid browser case failed awaiting first exact-code card (investigation ongoing).
- Final review: four Important findings accepted: new literal numeric boundaries; semantic contact synonyms; separated model identity; bounded index continuation. Regression tests watched RED then GREEN. Added internally authenticated inventory-only worker continuation, bounded retry/backoff, persisted error state. No shared API changes.
- Review declined live relevance/threshold/latency/device certification: retained as explicit pending verification; missing provider key prevents live relevance certification. No claim that synthetic vectors establish actual Arabic recall.

- Real Staging inventory API v11 ACTIVE, additive private migration installed. Health 200 reports semanticSearchConfigured:false (missing key); localhost CORS OPTIONS204; unauthenticated search401; internal worker unauthenticated401/browser403. All three semantic tables have RLS and deny anon/authenticated SELECT. Shared unified API remains v19 untouched.
- Current CI 39946427357: SQL and focused source/backend jobs passed, browser dependency install still in progress. Real unit suite99/99, original static/hash guards and packaging parity passed. Native identity Python unittest1/1 passed (initial accidental Node invocation of the Python file corrected).
- Review minor (failure state recording) also addressed as part of the continuation fix: persisted last_error, bounded retry_after and failure count; explicit unavailable reason. No deferred minors. Threshold/real-data relevance remains unverified until key setup.

## Delivery verification
- Source/APK commit17cd57081ed4348650337040e2065ea62f66e72d. CI39947028015 all jobs passed, including8/8 real Chromium tests, real pgvector leases/readiness/reuse/current-only retrieval and private privilege denial. Combined change QA39947028062 passed.
- The first new browser test failure was a fixture layout issue: its host omitted inventory-047.css. The corrected host uses the same stylesheet as the existing passing UI fixture; the first exact-code card and semantic/literal/cancellation assertions pass in Chromium.
- APK workflow39947028079 passed. Packagecom.icc.maintrack.preview047r6, version0.4.7/407, temporary side-by-side QA signer verifiedv2/v3. All30 native/public application assets match the prepared source. Device installation not run.
- APK SHA2564969bb63b61fe7def16bc9380c682398b9527eba169ff34f0ca8e92454aa981a. Saved delivery MainTrack-0.4.7-HYBRID-SEARCH.apk.
- No real inventory upload, approval, row modification or deletion performed. No main/Production/OTA/shared login API change. Prior Web CORS approval remains unresolved; no new Web link is advertised as working.
- Implementation choices: fixed embedding model/dimensions, conservative0.35 similarity threshold,100 candidates/50 semantic additions. These bound cost and response size, but are not precision/recall guarantees. Real-stock acceptance remains mandatory before claiming the semantic feature is active/accurate.

## Remaining external prerequisite
- [ ] Configure OPENAI_API_KEY in MainTrack-Staging Edge Function Secrets. It must remain server-side and must not be pasted into chat.
- [ ] Verify live semanticSearchConfigured:true, completion of the current approved snapshot index, Arabic/English recall across multiple families, negatives for related cables/heaters versus sensors, and type/model/unit constraints with the actual provider. Adjust relevance thresholds only from those measurements.
- No provider key was available during this task. Live health honestly reports cloudSearchConfigured:false and semanticSearchConfigured:false. The downloadable app currently retains local/exact/technical retrieval until setup; it must not be described as providing live semantic search yet.
