# MT-SEC-005 — unapplied owner review package

Apply neither payload nor deployment until separately approved.

Observed: main and release/maintrack-047-final-20261024 have no classic protection; active ruleset25393921 covers the old044 branch only. Android release environment has no required reviewers. Read-only raw responses are in the final evidence bundle.

1. After revised workflows are reviewed/pushed and actual checks succeed on the target commit, apply branch-protection.PROPOSED.json to both named branches. Contexts are security-local and logout-contract from GitHub Actions App15368. Do not require the currently nonexistent candidate-bound evidence context as a PR check.
2. Configure valid Code Owners and at least one independent authorized reviewer. The PR author cannot approve their own PR. Keep stale approval dismissal, last-push approval, admin enforcement, no force push/deletion and no configured bypass actor. Administrators can still change settings; audit this rather than claim irreversible enforcement.
3. Protect the existing maintrack-android-release environment and the proposed maintrack-production-approval with independent owner-approved reviewers, prevent self-review, no admin bypass and restricted release branches. These are administrative changes, not executed.
4. BEFORE any signing/publishing workflow receives secrets, add a trusted platform verifier for actual environment approval history and exact commit/artifact. Extract the native overlaid client from the actual APK, bind it to security-provenance.json and Web headers/client produced by prepare-security-rc.mjs, then call evaluate with verified metadata. Never accept an approval boolean or arbitrary approval JSON from candidate evidence. No such trusted integration is implemented yet. CLI therefore intentionally remains NO-GO.
5. Require the successful candidate-bound release gate upstream of every enabled operational signing/publishing entrypoint; disable alternative publication paths or enforce the same gate, after owner review. Do not enable cloud schedules.

Local gate tests cover readiness of all five findings, mandatory cases, artifact/source and build provenance, cleanup and rejection of self-asserted approvals. These tests do not prove GitHub administration or publishing enforcement. MT-SEC-005 remains PARTIAL, not closed. No owner administration, CI dispatch, signing, merge or deployment performed.
