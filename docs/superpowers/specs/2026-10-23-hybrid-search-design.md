# General hybrid inventory search

The user approved implementation of the preceding chat design: exact code, partial code and literal matches stay first; semantic matches add real current-stock items in the same list, labelled «مرتبط بالمعنى». This is a general retrieval feature across all uploaded stock, not a dictionary built around one temperature-sensor example.

Use the existing local V9 engine without changing its locked source. Add a coordinator that includes literal matches independently of inferred categories, ranks exact > literal > existing technical > semantic, and never removes a local match. User-selected filters and sort still apply. Explicit numbers, model identifiers, signal and contact specifications constrain semantic additions. Requests and results are pinned to the active snapshot; clear, reload and logout cancel old responses.

Create embeddings for code/description/brand/model only, excluding quantity, location, employee data and files. Use OpenAI text-embedding-3-small, 256 dimensions, server-side key, fixed endpoint, bounded batches/timeouts, no generation of stock. Cache document vectors by content hash/model; map each approved version's codes to those documents. Reuse unchanged descriptions across versions. Private pgvector tables, no browser SQL access. Query vectors retrieve current-version candidates; no hardcoded taxonomy.

Build incrementally after snapshot loading/publication in background, with a database lease and durable progress so interrupted workers resume. Search returns an honest indexing/unavailable state while local results remain usable. A ready index is used only if all approved rows are mapped. Provider errors, missing key and daily limits keep local search intact.

Approaches: extending synonym lists does not meet general meaning retrieval; query expansion alone misses abbreviations and is not a stock index. Adopt content embeddings plus preserved local retrieval. Threshold and candidate count are conservative implementation choices, not accuracy guarantees; actual Arabic/English recall must be measured with a configured provider and the user's stock.

Scope: existing isolated feature branch and Staging inventory service only. Retain Owner version management, approved design and all stock. No Production/OTA/shared login API changes. The previous shared-API CORS rejection remains in force. No key is available yet; finish implementation and synthetic checks before requesting server configuration. Do not claim live semantic quality or activation without that verification.
