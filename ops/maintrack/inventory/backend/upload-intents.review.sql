-- REVIEW ONLY. No application or cloud installation performed automatically.
-- Required BEFORE enabling uploads in this candidate. Missing table fails closed.
CREATE TABLE inv_lab.upload_intents(
 storage_key text PRIMARY KEY CHECK(storage_key ~ '^inventory/imports/[0-9a-f-]{36}\.xlsx$'),
 file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('RESERVED','ATTACHED')),
 actor text NOT NULL,version_id bigint REFERENCES inv_lab.versions(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((state='ATTACHED')=(version_id IS NOT NULL))
);
-- One unresolved object bounds exposure until independently reconciled.
CREATE UNIQUE INDEX one_unresolved_inventory_upload ON inv_lab.upload_intents((true)) WHERE state='RESERVED';
ALTER TABLE inv_lab.upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inv_lab.upload_intents FROM PUBLIC;
-- Owner/RLS/privileges for the actual private backend role require separate review.
-- Do not grant this table to anon/authenticated or browser clients.
