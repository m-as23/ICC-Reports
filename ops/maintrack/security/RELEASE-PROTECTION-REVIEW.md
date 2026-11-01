# MT-SEC-005 — unapplied owner review package

Apply neither payload nor deployment until separately approved.

Observed: main and release/maintrack-047-final-20261024 have no classic protection; active ruleset25393921 covers the old044 branch only. Android release environment has no required reviewers. Read-only raw responses are in the final evidence bundle.

1. After revised workflows are reviewed/pushed and actual checks succeed on the target commit, apply branch-protection.PROPOSED.json to both named branches. Contexts are security-local and logout-contract from GitHub Actions App15368. Do not require the currently nonexistent candidate-bound evidence context as a PR check.
2. Configure valid Code Owners and at least one independent authorized reviewer. The PR author cannot approve their own PR. Keep stale approval dismissal, last-push approval, admin enforcement, no force push/deletion and no configured bypass actor. Administrators can still change settings; audit this rather than claim irreversible enforcement.
3. Protect the existing maintrack-android-release environment and the proposed maintrack-production-approval with independent owner-approved reviewers, prevent self-review, no admin bypass and restricted release branches. These are administrative changes, not executed.
4. BEFORE any signing/publishing workflow receives secrets, add a trusted platform verifier for actual environment approval history and exact commit/artifact. Extract the native overlaid client from the actual APK, bind it to security-provenance.json and Web headers/client produced by prepare-security-rc.mjs, then call evaluate with verified metadata. Never accept an approval boolean or arbitrary approval JSON from candidate evidence. No such trusted integration is implemented yet. CLI therefore intentionally remains NO-GO.
5. Require the successful candidate-bound release gate upstream of every enabled operational signing/publishing entrypoint; disable alternative publication paths or enforce the same gate, after owner review. Do not enable cloud schedules.

Local gate tests cover readiness of all five findings, mandatory cases, artifact/source and build provenance, cleanup and rejection of self-asserted approvals. These tests do not prove GitHub administration or publishing enforcement. MT-SEC-005 remains PARTIAL, not closed. No owner administration, CI dispatch, signing, merge or deployment performed.

## Standing authorization follow-up

Read-only approval verifier and exact native APK entry hashing are now implemented in security-regression/platform_approval.py, with three focused local tests. release_gate.py --platform-run accepts no approval JSON from evidence. This is NOT a completed trusted publishing integration: independently reviewed workflow ordering and immutable build-artifact/run association must be proven before enabling signing. No live owner approval was available or manufactured. The verifier is a building block, not authorization to release.

Only m-as23 is currently a repository collaborator. The proposed independent review and prevent-self-review requirements cannot be made usable until a separate authorized reviewer/build initiator is established. Therefore do not apply protection in a way that strands the owner permanently. New standing authorization permits application after these prerequisites, but does not manufacture a second reviewer.

Push safety: GitHub trigger review excludes the integration branch from signing workflows and hooks list is empty. Vercel's connected project response did not expose its git production-branch/automatic-deployment policy; no reliable proof of absence of all operational auto-deployment was available. Do not push under the user's conditional authorization until this missing policy is verified. No CI success on the new commit is claimed.


## Superseding applied Single-Owner policy — 2026-11-01

Owner m-as23 explicitly approved replacing independent human review. This is not equivalent to a second human review. Actual GitHub administration now protects main and release/maintrack-047-final-20261024: required security-local/logout-contract from GitHub Actions App15368, strict up-to-date checks, PR path with0 independent approvals, admin enforcement, conversation resolution, no force push/deletion. No CODEOWNERS/last-push reviewer deadlock is imposed.

All14 registered legacy signing/OTA workflow IDs were globally disabled and read back disabled_manually. Both maintrack-production-approval and maintrack-android-release require m-as23 approval, prevent_self_review=false, admin bypass=false, restricted branch policies; the old044 environment branch permission was removed. Before/after snapshots and per-operation receipts are in evidence/single-owner-20261101 outside Git.

Artifact approval is NOT supplied by this policy approval. New single_owner_approval.py reads actual unsigned Artifact bytes/digest, pinned build/gate workflow source, Owner-only unedited issue comment containing exact source/run/artifact/certificate binding, protected environment approval referring to that exact comment/body digest, and actual gated-job start. It does not invent a review timestamp: ownerSignoffAt is the API comment creation time; approvalObservedBy is the protected job start upper bound, not an approval-event timestamp. No comment or approval is posted automatically. CLI release_gate accepts these trusted receipts explicitly; candidate evidence alone cannot switch approval authority. Independent mode remains available for compatibility and is not forged.

Signing and final publication remain unauthorized. Mandatory QA/case/readiness gates are unchanged. The enabled release signer and real allowed Owner flow cannot be declared verified until a real unsigned APK, reviewed public certificate, human signoff and protected approval are available. Proposed signing YAML remains inert; no secret is consumed or key used by these readers.
