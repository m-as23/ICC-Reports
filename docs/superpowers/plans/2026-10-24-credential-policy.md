# Numeric employee codes and alphanumeric passwords

Goal: enforce the user's approved rules in Final Web/native and the current Final API.

Approved scope: employee codes contain ASCII digits only, 1-32 characters, preserve leading zeros; login may normalize Arabic digits as it already does. New passwords contain ASCII letters and digits only, at least one of each, 8-64 characters. Existing passwords are still accepted at login. Temporary passwords must satisfy the same policy. No account, role, catalog, or report data migrations.

Implementation: preserve historic canonical assets and derive the focused changes in Final packaging. Share policy functions with the API. Numeric placeholder 1111 and numeric keyboard for login and employee creation. Show the password requirements and validate before submission; enforce on the API independently.

- [x] Write failing behavior tests for employee creation, password changes and generated temporary passwords, plus Final HTML.
- [x] Implement policy and reviewed API derivation; apply UI changes to matching Web/native assets.
- [x] Verify leading zeros, one-digit codes, digits/letters-only passwords, spaces, symbols, Unicode and unchanged old password login behavior.
- [x] Run packaging, relevant application regression and browser checks; independent review.
- [x] Publish reviewed code, deploy current Final API and Web; build/sign matching Android and publish compatible signed OTA if available through existing protected release workflow.

Implementation choice: 64-character maximum avoids bcrypt's 72-byte truncation for permitted ASCII passwords. Preserve existing account credentials; do not log passwords or tokens.

Verification: 14 policy/package/OTA tests, 108 current native tests, 20 team-ledger/reset tests, 9 inventory browser tests and the real credential browser flow pass. The unrestricted native npm suite retains the known historical shared-source.test.mjs failure because it pins immutable 046 UI; current 047 parity is separately checked. No historical pin was changed.

Independent review found an inherited old-password SQL comparison bug. Confirmed with read-only synthetic pgcrypto query; regression failed before correction and passed after. Correct stored-hash comparison is applied only in the Final service.

Release: compatible web OTA bundle 0.4.8, native compatibility floor 0.4.7; existing 407 installer identity and original certificate remain. No database rows changed.

Completed release evidence:
- Runtime source d048a8bbec3e2df4dafde87491a572a6ce90175d; all 10 GitHub checks successful, build/sign run 40128804143.
- Final API v2 ACTIVE, deployed files match reviewed source. Existing numeric Owner remains active; no account/catalog/report data migration executed.
- Vercel dpl_ETPSVEviaqNYnBmU1ggjc9sbNNGq READY; all 31 public assets match reviewed Web.
- APK 5,174,062 bytes, SHA256 430eac969b5a4d66d4f3f8db47e2ade62b2a004b6929cf4f2b1f18a3bdaa4845. Original certificate and CI v2/v3 signatures verified; all 36 native application assets independently compared after download. Physical device installation remains user validation.
- Public signed OTA 0.4.8 published at discovery commit 288e7353de9522b7f7986b27cdc247c7c7aec257. Bundle SHA256 cab3f44de6e6c3ffbacc4f32f8d56e7ddd95c9553f27781d641c879f1469daa0; native floor 0.4.7; no local-data migration. Metadata expires 2026-10-30T20:16:59.022Z and requires renewal before expiry.

WhatsApp follow-up authorized by Owner: support number 201270437241. Show a prepared user-confirmed WhatsApp message containing the numeric employee code only; require a valid code before showing the contact link. Never include passwords or tokens, never send automatically, never reset an account from the public login screen. Add regression coverage for nonexistent/inactive/bad-password denial, lock enforcement and duplicate account codes. Existing combined BAD_PW response is preserved and was explained to the Owner. Backend unchanged in this follow-up.

WhatsApp release verification: source a7b878abd669a146d7fcd53ec94d6cb1897eb752, all 10 checks green; build/sign run 40131142833. The mobile QA browser-install step was delayed but completed successfully; no gate bypassed. Vercel dpl_E2sSGF9H132q19eMfpDSLc1UZ6xp READY and all 31 public assets matched. Original-certificate APK SHA256 bc37ac6a94ccb61366d49e5d201e753e1632d60045ca96f32beb2865b62a92e1, 5,174,062 bytes; 36 native application assets matched independently. Signed OTA 0.4.9 published at 6004f5ee856179623f3e3511e462769899e52c7c, metadata expires 2026-10-30T20:53:43.988Z. Support opening and message preparation tested without navigating to WhatsApp or sending any message. Physical device activation remains user verification. Backend, account data and catalog unchanged in this follow-up.
