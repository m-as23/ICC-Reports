# Independent QA recovery runner

Target is pinned to `szhstrafzkxzstjdcynl`. No MCP dependency and no Windows security-policy change. Primary entrypoint is native Node, callable from ordinary PowerShell:

```powershell
node .\ops\maintrack\recovery\qa-recovery.mjs --mode Preflight --output .\preflight.json
node .\ops\maintrack\recovery\qa-recovery.mjs --mode DryRun --manifest C:\QA-Snapshot\manifest.json --manifest-sha256 <reviewed-sha256>
```

The optional `.ps1` equivalent is blocked by the current Windows PowerShell execution policy; do not use `Bypass`, `EncodedCommand`, or change policy to run it. Native Node is the permitted alternative. Same machine, Windows account credentials and network are still dependencies. Copying a script does not supply off-device resilience.

## Actual access status

### Handover reconciliation, 29 October 2026

The owner independently verified the existing `maintrack_qa_recovery` Session Pooler service with interactive `psql -W`, TLS 1.3 and `verify-full`. CLI metadata read and a separately downloaded current Core v10 / Inventory v9 match all nine retained snapshot file hashes. This supersedes the earlier missing-login observation below. It does not prove SQL or Edge restore.

The native runner now accepts explicit `--transport qa-session-pooler`: the endpoint is pinned to the observed QA pooler `aws-1-eu-central-1.pooler.supabase.com:5432` and the pooler user to `postgres.szhstrafzkxzstjdcynl`; TLS `verify-full` and a live QA scope assertion remain mandatory. There is no automatic fallback. The default remains direct QA host. A safe noninteractive named-service probe returned `no password supplied`; this process has not received a protected unattended credential provider. Do not read the owner's password-reference file or pass a password in argv, evidence or environment output. An operator may perform interactive schema capture from an ordinary terminal using the approved service; unattended restore readiness remains BLOCKED until its secure credential channel and exact restore permissions are verified.

### Capture TLS correction

The owner's `pg_stat_ssl.ssl=false` observation is the pooler-to-PostgreSQL leg. It does not contradict client-to-pooler TLS1.3, but client `verify-full` cannot certify that backend leg. Read-only official CLI `ssl-enforcement get` confirmed `currentConfig.database=false`. No setting was changed. Supabase documents that SSL enforcement governs both shared-pooler legs and requires a database restart; changing it is outside this task.

Capture now defaults to **direct** with pinned `user=postgres`, overriding the pooler-specific username inherited from the service. It retains `sslmode=verify-full`, the service's existing CA configuration, and the mandatory backend SSL check before `pg_dump`. The capture manifest records client verification separately from the PostgreSQL TLS observation. Native/optional PowerShell recovery preflight also rejects absent backend TLS.

Actual direct probe: DNS supplies IPv6 only, but TCP returned `ENETUNREACH`; no IPv6 default route was visible. Direct TLS/certificate validation remains NOT TESTED. The corrected command stops before password prompts or output directory creation while direct TCP is unavailable. It does not switch to the pooler automatically. Use an already trusted IPv6-capable network to reach the official direct endpoint; no paid add-on, VPN/tunnel or project setting was configured. The official IPv4 alternative is session pooling, but its currently observed unencrypted backend leg fails this policy. An explicit pooler selection never bypasses the backend SSL guard.

### One-command interactive read-only schema capture

From an ordinary PowerShell terminal with the verified user PATH:

```powershell
node D:\MainTrack-Android-QA\integration-candidate\ops\maintrack\recovery\capture-qa-schema.mjs --mode Capture --execute-readonly yes --transport direct
```

Without those mode/execute flags, the command only prints a safe DryRun plan. It neither writes a snapshot nor connects. Capture uses the existing `maintrack_qa_recovery` service, with explicit QA host, port, direct username, database and TLS. After direct TCP is reachable, it asks for the QA PostgreSQL password **twice**, directly through official `psql` and `pg_dump` terminal prompts; Node never reads or stores it. The first client must actually confirm backend TLS before the dump starts. Do not paste the password into the command itself or this conversation. Two prompts avoid exporting a password between independent official clients.

The command creates a new directory below `D:\MainTrack-QA-Recovery` with inheritance disabled and current-user/SYSTEM-only ACL, then captures a read-only QA identity/catalog attestation and a schema-only custom archive. No existing snapshot is overwritten. Existing ownership/ACL/RLS/trigger definitions are retained in the archive; it does not use `--no-owner` or `--no-acl`. The archive index and SHA-256 file manifest are generated locally. On a timeout, authentication error or other failure, it stops without retry and preserves an INCOMPLETE/failure manifest. Local synthetic contract tests do not prove capture or restore success.

The archive is a PostgreSQL-consistent schema snapshot, but the earlier catalog attestation is a separate read transaction. Do not call the two atomically consistent or a complete recovery package; require a quiescent maintenance baseline and reconcile them before mutation. The scope is the three observed schemas `qa_security_final_20261025`, `qa_security_inventory_20261025`, `maintrack_qa_lease`. Any additional permanent-QA schema, external dependency, role definition, scheduler job row, synthetic counter/session/ledger state, or protected Recovery payload must be independently reviewed and captured as applicable. The explicit noncredential role metadata is not a `CREATE ROLE` script. No auth/storage table rows, passwords, `pg_authid`, or old hashes are selected.

Raw schema definitions can contain embedded secrets. The directory is restricted, and its raw archive/catalog must **not** be added to Git or a shareable evidence ZIP before secure review. Success is reported as `CAPTURED_PENDING_SECRET_REVIEW_AND_LOCAL_RESTORE`, never Restore PASS or Cloud Cutover authorization. Unattended stop/restore still needs a separate protected credential provider and reviewed executor; this interactive capture does not supply one.

Fresh native Windows PowerShell reconstructing Machine+User PATH successfully ran the Node runner. Installed CLI/tool presence was verified separately by the main tools task. Actual independent `functions list --project-ref ... --output json` returned authentication-required (raw output suppressed). No named PostgreSQL QA service/pass file or configured connection input was identified. SQL read, SQL restore, Edge source download and Edge restore are **BLOCKED / NOT TESTED**, not VERIFIED by local fixtures.

One human setup request: use the official interactive `supabase login --name MainTrack-QA-Independent` flow from an ordinary terminal if that account session is approved; never pass `--token` on a command line or send a token in chat. CLI2.122.0 login accepts user-scoped tokens and rejects project/organization-scoped tokens. If the owner instead supplies an already approved project-scoped QA token via a secure process environment provider, use it directly for explicitly project-pinned commands rather than trying to log it in. Do not extract the connector/MCP credential. Reuse an already approved QA database role/credential via a named libpq service with the exact QA host, database `postgres`, TLS `verify-full`, and a protected per-user credential mechanism. Do not create a new admin role or use Production credentials. The runner forces direct QA host and refuses untrusted target strings; direct-host reachability may independently fail and has no automatic pooler/production fallback.

Run `--service <existing-qa-service>` only after the owner provides that approved existing path. SQL check is `BEGIN READ ONLY` and returns project binding plus selected capability booleans, no user/password hashes. Edge metadata list proves only metadata read; it does not prove source download or deploy privileges. Official deployed source download and exact-hash verification must then be exercised under the approved read-only identity. Write privileges require the separately authorized rehearsal, not a guessed capability bool.

## Snapshot and future restoration

Capture original Core/Inventory modules, schema-only SQL for the four declared QA schemas, exact original function/trigger/policy/ACL/owner statements, specific two-account counters/absence, owned session/ledger identities and the pinned scheduler job. Never dump `mt_users` data or old credential hashes, use `pg_dump --schema-only` rather than a full-data dump, and select only explicit noncredential role attributes from `pg_roles`. Keep non-window row digests and audit evidence. Review source/dependencies for secrets before manifest creation.

Provide five reviewed SQL payloads (`close-admission.sql`, `restore-sessions-counters.sql`, `restore-database-catalog.sql`, `stop-owned-job.sql`, `verify-baseline.sql`) and complete Edge payload under `edge/supabase/functions/<allowed-name>/index.ts`, with its pinned edge/supabase/config.toml and dependencies. Preserve each function’s reviewed verify_jwt/import-map settings; absence of config is rejected rather than assuming CLI defaults. `create-manifest.mjs --root <snapshot> --source-commit <40hex>` hashes the complete local snapshot. It neither captures cloud state nor proves restoration. It rejects common secret/private-key files, but automated filename scanning is not a complete secret review.

Preflight/DryRun are the defaults and dispatch no restore writes. The current standing QA authorization permits scoped non-destructive QA work after verified snapshot, independent stop/recovery and bounded execution prerequisites; it supersedes previous repeated-QA-approval requests. It does not authorize a destructive whole-database restore, Production or credential rotation. A concrete execution record must still bind project, manifest hash, ordered phases, exact expiry, `action=RESTORE_QA_SNAPSHOT`, `ownerApproval=true` and `independentRehearsalVerified=true`; native invocation additionally requires `--mode Restore --execute-approved-restore yes`. Reference the actual standing authorization for eligible operations rather than manufacturing a platform approval or requesting permission again. These fields enforce scope and operator evidence; do not set rehearsal true before it happened. No such independently verified recovery package exists yet.

Restore rechecks pinned source/file hashes before each phase, confines paths, rejects reparse points and unpinned Edge payload files, and requires live read identity first. Successful CLI status remains `EXECUTED_PENDING_INDEPENDENT_VERIFICATION`. Every attempted restore is counted before dispatch. Any failure/timeout is ambiguous: stop, do not repeat, independently reconcile. Single-machine crash may lose local in-memory phase state; the server lease and durable server journal remain mandatory. This runner is not an autonomous scheduler or automatic deadline guarantee.

The seven-phase template closes admission, restores/verifies session/counter data, restores closed Edge sources, stops only the pinned job, restores the original catalog, then verifies the complete baseline. It is **not an approved operational rollback plan**: reviewed data phases must raise on mismatches, and the scheduler cannot be stopped before verified data recovery or left running during conflicting catalog restoration. The final live scope/order still requires independent review. Existing independent full Edge+SQL rollback has not been verified, so cloud Cutover remains NO-GO.

References: [Supabase CLI](https://supabase.com/docs/reference/cli/introduction), [libpq named services](https://www.postgresql.org/docs/17/libpq-pgservice.html), [PostgreSQL credential files](https://www.postgresql.org/docs/17/libpq-pgpass.html).
