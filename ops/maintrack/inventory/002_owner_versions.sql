-- Additive inventory-only Owner version management. Retains every approved file/item.
BEGIN;
ALTER TABLE inv_lab.versions ADD COLUMN IF NOT EXISTS excluded_at timestamptz;
ALTER TABLE inv_lab.versions ADD COLUMN IF NOT EXISTS excluded_by text;
ALTER TABLE inv_lab.audit DROP CONSTRAINT IF EXISTS audit_event_check;
ALTER TABLE inv_lab.audit ADD CONSTRAINT audit_event_check CHECK(event IN ('STAGED','SEALED','PUBLISHED','REJECTED','RESTORE_REQUESTED','VERSION_EXCLUDED','VERSION_REINSTATED'));
CREATE TABLE IF NOT EXISTS inv_lab.search_budget(actor text NOT NULL,day date NOT NULL,requests integer NOT NULL CHECK(requests>0),PRIMARY KEY(actor,day));
REVOKE ALL ON inv_lab.search_budget FROM PUBLIC;
COMMIT;
