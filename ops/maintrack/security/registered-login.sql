-- LOCAL REVIEW CANDIDATE ONLY. No automatic installation, roles or grants.
-- Unexposed schema; cloud owner/runtime/operator/RLS attestation is a cutover prerequisite.
CREATE SCHEMA mt_registered_identity;
REVOKE ALL ON SCHEMA mt_registered_identity FROM PUBLIC;
CREATE TABLE mt_registered_identity.principal(
 id uuid PRIMARY KEY, employee_code text NOT NULL UNIQUE CHECK(employee_code ~ '^[0-9]{1,32}$'),
 epoch integer NOT NULL DEFAULT 1 CHECK(epoch>0), enabled boolean NOT NULL DEFAULT true);
CREATE TABLE mt_registered_identity.invitation(
 principal uuid PRIMARY KEY REFERENCES mt_registered_identity.principal(id), token_hash text NOT NULL UNIQUE,
 epoch integer NOT NULL, expires timestamptz NOT NULL, verification_ref text NOT NULL);
CREATE TABLE mt_registered_identity.credential(
 id text PRIMARY KEY, principal uuid NOT NULL REFERENCES mt_registered_identity.principal(id),
 public_key bytea NOT NULL, counter bigint NOT NULL CHECK(counter>=0), revoked boolean NOT NULL DEFAULT false);
CREATE TABLE mt_registered_identity.used_proof(
 principal uuid REFERENCES mt_registered_identity.principal(id), nonce text NOT NULL, expires timestamptz NOT NULL,
 PRIMARY KEY(principal,nonce));
CREATE TABLE mt_registered_identity.operator_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, principal uuid NOT NULL, operation text NOT NULL,
 verification_ref text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE mt_registered_identity.principal ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_registered_identity.invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_registered_identity.credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_registered_identity.used_proof ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_registered_identity.operator_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mt_registered_identity FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mt_registered_identity FROM PUBLIC;
-- No anonymous RLS policies; no SECURITY DEFINER; no role membership or public API grants.
-- Local owner bypass is not evidence that a cloud runtime role is ready.
