# Interactive PostgreSQL authentication correction — 2026-10-31

Observed the failed run read-only: SSL enforcement remains false/appliedSuccessfully true, enableAttempted false, no Capture, no maintenance lock and no local psql/pg_dump process at review. No Supabase mutation or reboot was dispatched by this run. Observation does not attest unrelated actors or database session quiescence; a new preflight checks that again.

Root cause: synchronous child startup immediately after readline closes can block Windows console read cancellation/handoff. A real ConPTY comparison reproduced broken synchronous prompting; asynchronous inherited-terminal execution consumed input correctly. The precise internal EOF event behind the original fe_sendauth message is not independently proven. Existing --password (-W) was correct; switching to --no-password (-w) would suppress prompting.

Fix: shared async terminal runner pauses parent stdin, leaves raw mode, yields the event loop, then spawns native processes with inherited console and bounded timeout. Node reads no password, supplies no credential arguments/environment and captures no prompt input. Used by preflight psql, nested capture Node process, capture psql and pg_dump. Unattended recovery --no-password remains deliberately dependent on its separate approved credential provider.

Verification: 18/18 affected automated tests PASS. Actual Windows terminal probes for psql and pg_dump consumed a public noncredential marker under masked native prompts, then reached an intentionally closed loopback endpoint. These are terminal handoff/failure-path tests, not successful database authentication or Cloud Acceptance. Mocked auth failure and timeout each dispatch once. verify-full, backend TLS guards, explicit acknowledgment, invocation limits and no retry remain intact.

Manual fresh Maintenance invocation is locally unblocked; it still requires fresh preflight and the user's explicit acknowledgment of reboot/no verified full-data-backup risks. No automatic retry or acknowledgment was issued. Recovery/Release remain NO-GO.

Independent tracks preserved: SEC-001 shared-capacity residual PARTIAL; Vercel explained assets preserved, old source commit unverified; Evidence005 needs genuine independent human/platform approval. No unaffected Android/Excel/API tests rerun. No Push/Merge/Production changes.
