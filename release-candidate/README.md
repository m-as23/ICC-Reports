# MainTrack release review inputs

The integrated and native directories materialize the frozen review source archives. Each provenance file records the exact member digests. Run `python release-candidate/verify.py --output audit-output/release-candidate` from a clean checkout to reconstruct and verify both archives.

The integrated directory contains Web, Gateway, Core, Inventory, DriveFault and the default-closed local guard. The native directory contains the production-lineage Android source review. Both require approved runtime bindings before release packaging. The integrated DriveFault HTTP surface requires a reviewed hosted implementation and approved catalog before activation.

For a GitHub handoff, use the candidate branch commit as the checkout SHA for the `security-local` and `logout-contract` jobs. Record the run and attempt IDs, the exact checkout SHA and tree, and the two artifact digests. The security-local job additionally verifies the archive provenance and checks both frozen Deno entrypoints. Record hosted acceptance and any production signing authorization in their separate gates.
