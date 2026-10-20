# MainTrack 0.4.6 — Continuous Safety Net, Full Simultaneous Employee Launch

**Status: QA preparation, NO-GO for mass release. Date: 2026-10-20.**
Owner has confirmed an all-users-at-once launch is operationally required. Do not propose a staggered pilot or pretend a synthetic test is equivalent to real traffic. The approved UX baseline is the exact Android 0.4.6/406 signed Owner-QA artifact built from commit `1248211b662981e3e7db27ac0a61ca4d23862ca1`; owner manually checked multiple roles. Keep that look/behavior stable.

## No third Supabase project

Continue using employee `MainTrack-Staging` and synthetic `MainTrack-RBAC-QA-Isolated` only. All data-writing tests, concurrency and report/leave/OT synthetic workloads must target the QA database exclusively. Do not mutate original employee Staging, deploy a new app, rotate user credentials, or run an unbounded flood test.

## Why existing green CI is necessary but insufficient

Latest branch CI provides Node, Chromium simulated Web/OTA/session, read-only Staging security smoke, synthetic RBAC and prior persisted full E2E and concurrency evidence. It does NOT currently establish 30 simultaneous authenticated real business transactions, 24/7 error capture in users' browsers, a completed encrypted full employee-data backup, on-device native 0.4.6 rollback, or a released Web 32-action parity build.

## Four continuous protection layers

1. **Before every change:** GitHub branch/PR required status checks, 32-action schema/API compatibility, Owner/Engineer/Technician RBAC, notification workflows, login persistence, exact source provenance, the intentionally removed bottom dock/Pilot overlay, native signing continuity, mobile offline report retention, and simulated OTA rollback. A regression stops the PR/update before publication. Protected `ops/maintrack-044-production-foundation-20261018` has the combined QA required check. The default `main` branch is NOT covered by that same required check, which must be separately addressed before broad rollout.
2. **Synthetic business-load qualification:** reproduce realistic user flows on the isolated QA database with 5/10/20/30 simultaneous sessions performing login, report create/read, duplicate replay, notifications, leave + overtime approvals. Measure valid operation success rate, 5xx, HTTP 429, p50/p95 latency, transactions per second, database connection saturation and p95 approval/save latency; verify confirmed reports and leave balances row-for-row and test idempotency. Proposed qualification threshold: >=99% valid operation success, API p95 <=1000 ms (on measured workload), and ZERO lost/duplicated acknowledged reports or privilege violations. Repeat and record exact release SHA and timestamps. **NOT YET PERFORMED for all 30 authentic business sessions**. Simple `healthz/readyz` probes are never accepted as evidence of 30-user capacity.
3. **After launch, read-only monitoring and telemetry:** `ops/maintrack/scripts/continuous-readonly-health.mjs` checks only four approved GET routes, for the existing employee Staging and synthetic QA projects, in a low-load bounded manner. `.github/workflows/maintrack-continuous-readonly-monitor.yml` proposes hourly checks, with GitHub Actions run failure as an initial alert surface. **GitHub cron runs only after this workflow is merged to the repository default branch** (`main`); in the Draft PR it is not active. Enable GitHub failed-workflow notifications and/or reviewed Resend alerts; never assert owner email is configured without verification. Health alone will not catch valid HTTP 200 responses containing bad data, incorrect employee sessions, unsent local queues, or silent business corruption. Before launch add privacy-safe client-side error telemetry, API error/latency/429 monitoring, hourly outbox failure and pending queue monitoring, duplicate-report anomaly counters and acceptance-to-DB checks. Never send passwords, login tokens, message bodies or employee personal data into public Actions logs.
4. **Actual disaster recovery:** current Supabase Free plan does **NOT** provide managed daily database backups. Vendor docs recommend regular exports and offsite copies (https://supabase.com/docs/guides/platform/backups). The checked-in 19-table sanitized file is ONLY synthetic QA data, NOT a real employee backup. Before all-user launch take a restorable **encrypted offsite** database backup using the official CLI/pg_dump and secure connection credentials, keep copies outside the public repository, preserve object Storage separately if applicable, safeguard signing keys/OTA manifests/signed APK hashes, test restoring to an isolated local Postgres / temporary safe recovery environment. Verify row counts, foreign keys, roles/auth, sequences and sample read-only scenarios. Set explicit Owner-accepted recovery targets (proposed **RPO <=1 hour**, **RTO <=4 hours**) rather than pretending perfect zero data loss. Hourly backups are only a proposal; cannot guarantee RPO until the job and recoverability are confirmed. Backups must never be raw GitHub attachments or API responses.

## Why hourly monitoring alone won't predict future bugs

Automation discovers known regression classes, invariant breaches and unexpected operational symptoms. It cannot foresee all new defects, guarantee 100% uptime, or retroactively recover transactions missing from the last verified backup. A production safety program needs proactive automated guards **plus** alarm response and verified recoverability. Restrict emergency automation to safe actions: notify Owner, block the next release, preserve forensic evidence and switch off a problematic future OTA channel *only if an independently tested reversible switch exists*. Do not automatically revert a live database migration, purge users, uninstall APKs or delete data.

## Supabase Free Edge-function budget is shared

Code evidence: `setInterval(()=>{if(S&&appAuthenticated&&!document.hidden)loadNotices();},20000)` in the canonical Web asset. Assuming each user is continuously active 8 hours/day, 22 workdays per month, periodic requests alone:
- 10 users: 316,800 per month at 20 seconds.
- 20 users: 633,600 per month.
- 30 users: 950,400 per month.
- Hypothetical 30 users at 60 seconds: 316,800 before any extra API and QA requests.

These are deterministic **scenario estimates**, not traffic measurements. On a 500,000-invocation shared Free-plan envelope, even 20 continuously visible users can exhaust the quota at the current cadence. A reviewed change to event-triggered refresh or a longer interval should be validated against notification timeliness, permissions and exact signed 0.4.6 source/versioning. Do not silently patch or relabel the signed 0.4.6 APK; modified APK assets require separately versioned review and build.

## Open gates and safe next actions

Machine-readable `ops/maintrack/qa/continuous-safety-release-gates.json` retains **8 explicit NOT-VERIFIED / PARTIAL / PREPARED** gates for all-user launch. No user-data mutation and no release authorization is embedded. First: arrange secure real Staging backup/restore; qualify synthetic realistic 30-user transaction load; audit API/Web parity; verify signed exact APK on-device; activate default-branch hourly monitoring and owner alerts; accept backup RPO/RTO. Only then approve one measured full-employee launch.

**Data integrity is the priority.** An observed, documented FAIL is safer than a false 100% PASS. Keep this PR draft, do not publish MainTrack 0.4.6 to employee devices until independently verified release acceptance.
