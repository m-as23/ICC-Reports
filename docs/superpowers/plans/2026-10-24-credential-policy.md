# Numeric employee codes and alphanumeric passwords

Goal: enforce the user's approved rules in Final Web/native and the current Final API.

Approved scope: employee codes contain ASCII digits only, 1-32 characters, preserve leading zeros; login may normalize Arabic digits as it already does. New passwords contain ASCII letters and digits only, at least one of each, 8-64 characters. Existing passwords are still accepted at login. Temporary passwords must satisfy the same policy. No account, role, catalog, or report data migrations.

Implementation: preserve historic canonical assets and derive the focused changes in Final packaging. Share policy functions with the API. Numeric placeholder 1111 and numeric keyboard for login and employee creation. Show the password requirements and validate before submission; enforce on the API independently.

- [x] Write failing behavior tests for employee creation, password changes and generated temporary passwords, plus Final HTML.
- [x] Implement policy and reviewed API derivation; apply UI changes to matching Web/native assets.
- [x] Verify leading zeros, one-digit codes, digits/letters-only passwords, spaces, symbols, Unicode and unchanged old password login behavior.
- [ ] Run packaging, relevant application regression and browser checks; independent review.
- [ ] Publish reviewed code, deploy current Final API and Web; build/sign matching Android and publish compatible signed OTA if available through existing protected release workflow.

Implementation choice: 64-character maximum avoids bcrypt's 72-byte truncation for permitted ASCII passwords. Preserve existing account credentials; do not log passwords or tokens.

Verification: 14 policy/package/OTA tests, 108 current native tests, 20 team-ledger/reset tests, 9 inventory browser tests and the real credential browser flow pass. The unrestricted native npm suite retains the known historical shared-source.test.mjs failure because it pins immutable 046 UI; current 047 parity is separately checked. No historical pin was changed.

Independent review found an inherited old-password SQL comparison bug. Confirmed with read-only synthetic pgcrypto query; regression failed before correction and passed after. Correct stored-hash comparison is applied only in the Final service.

Release: compatible web OTA bundle 0.4.8, native compatibility floor 0.4.7; existing 407 installer identity and original certificate remain. No database rows changed.
