# QA schema Capture and local Restore acceptance â€” 31 October 2026

Source candidate: `9c86043f89009a29ed3b705ae05bbc9195e7bf34`; retained baseline `99d7695`. Only evidence changes in this round. Project `szhstrafzkxzstjdcynl`.

| Gate | Result | Evidence/limit |
|---|---|---|
| Independent user Capture | PASS | Completed source run, enable attempt1/CLI6; not repeated |
| Observe SSL | PASS | database=true, appliedSuccessfully=true; read-only, no rearm |
| Artifact integrity | PASS 3/3 | Original snapshot and all catalog/archive/index digests verified |
| Secret review | Completed locally | No detected key/JWT/credential assignment or table-data entry; original SQL and archive remain private |
| Real local restore | PASS scoped | New private PG17 cluster, 127.0.0.1:55439 only; stopped after verification |
| Catalog equivalence | PASS | 3 schemas,14 functions,137 relations,34 policies,187 triggers; owners/ACL/RLS equal |
| Definition roundtrip | PASS | Re-dumped executable schema SQL identical except dump banners/random restrict markers |
| Runtime local boundaries | PASS 4/4 | Core/Inventory roles denied private ledger and not Cleanup members |
| Cloud quiescence | PASS read-only | Jobs/active jobs/valid sessions/ledger/unclosed leases all0; permanent schema absent |
| Independent Cloud SQL/Edge restore | NOT TESTED | This round did not restore/deploy anything in cloud |
| Permanent QA/Scheduler acceptance | BLOCKED | Independent scoped multi-component rollback still incomplete |
| Storage/final Android acceptance | BLOCKED on final backend | Historical/local evidence retained; no upload/delete or native11 rerun |
| Release | NO-GO | Other mandatory gates remain open |

`restoreAuthorized=false` in the immutable Capture manifest means no restoration authority is conferred by capture. It remains unchanged. The user's current explicit instruction authorized only this isolated local restore, not a cloud restore. No guard was bypassed.

Internal RI trigger names contain newly generated PostgreSQL OIDs. All39 application triggers matched exactly; all148 internal triggers matched after removing only the validated OID suffix. Native re-dump SQL, including foreign keys, matched exactly. This is not an assertion that physical OIDs survive restore.

The local prerequisite roles were created NOLOGIN, without passwords, with captured inheritance/bypass flags and memberships needed by object ACLs. No Cloud login-role authentication or complete cluster-global grantor/SET/INHERIT-option equivalence is asserted. The schema archive itself omits role creation. A full host-role restoration needs separately reviewed global role metadata, not credentials.

## Scope not captured

No table rows, user passwords/hashes, session tokens, ledger contents, counters, baseline data, sequence current values, Storage bytes/object catalog, Edge code/config/secrets, cron.job definitions/run history, cron extension/ownership/settings, roles/global settings or schemas outside the three declared schemas. Functions prepare and stop_job reference cron.schedule/cron.alter_job/cron.job; those executable dependencies are not in this archive and were not mocked to claim runtime PASS. The qa_control references occur only in SQL comments; they are not executable external dependencies. Catalog metadata and archive were captured in separate transactions; cross-file atomicity is not claimed.

## Independent Stop/Recovery and next executable gate

Capture fixes the transport/archive blocker; it does not close independent end-to-end recovery. Native local stop is verified and no maintenance lock/local postmaster remains. Existing standalone recovery runner still requires a pinned reviewed multi-phase package and independently verified execution record. Do not mark that record true based on this local test.

Before any permanent-baseline or Storage mutation: assemble/verify original Edge and SQL dependencies, scoped session/counter/owned-resource baseline, explicit close-admission and verification payloads, pinned job identity and independent operator/provider; prove the exact stop/rollback path without this Codex/MCP process. Existing standing QA authorization remains valid for eligible non-destructive work after these preconditions; no repeated generic authorization is requested. No destructive Cloud Restore is authorized. Current recovery payload/rehearsal gap blocks new cloud writes, not independent local work.

No full data backup has appeared as a consequence of schema Capture. Do not represent restart rollback or schema restoration as recovery of data/Storage.

## Independent security/release tracks

SEC-001 remains PARTIAL: retained19 budget tests and idle recovery do not remove active four-slot multi-account contention. No trustworthy source identity or acceptable capacity-risk decision is invented. Source was not changed, so no duplicate tests run.

SEC-002/003/004 evidence remains valid within prior scopes; no production application is claimed. Vercel asset explanations/settings preserved; old CLI deployment commit remains unverified and forward controlled provenance is required. Evidence005 needs a genuine independent reviewer/platform approval and final artifact/signing run. Android native11/lab OTA-TLS preserved; final backend/store-after-login equivalence remains blocked. Quarantine still is not physical cleanup.

External actions: nominate the independent reviewer/stop operator and approved secure credential channel if none exists; final signing/deployment remains separately approved. No IPv6 or password-in-chat request. Existing independent manual psql access is accepted, not reconfigured.

Reference: PostgreSQL17 pg_restore documentation https://www.postgresql.org/docs/17/app-pgrestore.html (archive executes source definitions; schema restoration cannot restore omitted data).

Local harness diagnostics: pg_ctl inherited pipe handles initially prevented the parent wait from completing; corrected to file-based native process logging. The loopback guard then normalized PostgreSQL inet text 127.0.0.1/32 as an IP interface. The raw generated-trigger-name comparison was recorded as mismatch before constrained OID normalization plus exact foreign-key SQL roundtrip. No archive content, original metadata, security assertion or cloud state was changed to force a result.
