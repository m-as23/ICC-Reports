-- CP-06 CODE REVIEW ONLY — NOT A DEPLOYABLE MIGRATION.
-- Pinned upstream: m-as23/SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be
-- Test exclusively on disposable GitHub Actions PostgreSQL. Never run on MainTrack Staging/Production without fresh Owner approval and verified backup.
-- Inventory module / independent PostgreSQL contract (NOT applied to MainTrack).
-- Never execute against MainTrack or any linked Supabase project without Owner approval.
-- All tables live in dedicated, non-exposed schema "inv_lab".
BEGIN;
CREATE SCHEMA IF NOT EXISTS inv_lab;
REVOKE ALL ON SCHEMA inv_lab FROM PUBLIC;
CREATE TABLE IF NOT EXISTS inv_lab.versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','current','archived','rejected')),
  parent_version_id bigint REFERENCES inv_lab.versions(id),
  source_version_id bigint REFERENCES inv_lab.versions(id),
  file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 255),
  file_storage_key text, -- private archive location; never a public URL
  item_count integer NOT NULL DEFAULT 0 CHECK(item_count >= 0),
  sealed boolean NOT NULL DEFAULT false,
  created_by text NOT NULL CHECK(length(created_by)>0),
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS inv_lab.items (
  version_id bigint NOT NULL REFERENCES inv_lab.versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK(length(trim(code))>0),
  description text NOT NULL,
  quantity numeric(20,4) CHECK(quantity IS NULL OR quantity >= 0),
  location text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(version_id,code)
);
CREATE INDEX IF NOT EXISTS inv_items_code_idx ON inv_lab.items (code);
CREATE TABLE IF NOT EXISTS inv_lab.active (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  current_version_id bigint REFERENCES inv_lab.versions(id),
  generation bigint NOT NULL DEFAULT 0 CHECK(generation >= 0),
  changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO inv_lab.active(singleton,current_version_id) VALUES(true,NULL)
ON CONFLICT(singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS inv_lab.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL CHECK(event IN ('STAGED','SEALED','PUBLISHED','REJECTED','RESTORE_REQUESTED')),
  version_id bigint REFERENCES inv_lab.versions(id),
  base_version_id bigint REFERENCES inv_lab.versions(id),
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- Pending rows can only be mutated before seal. Approved/archived rows are immutable.
CREATE OR REPLACE FUNCTION inv_lab.reject_mutation_after_seal()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, inv_lab AS $$
DECLARE v inv_lab.versions;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v FROM inv_lab.versions WHERE id=OLD.version_id FOR UPDATE;
  ELSE
    SELECT * INTO v FROM inv_lab.versions WHERE id=NEW.version_id FOR UPDATE;
  END IF;
  IF NOT FOUND OR v.sealed OR v.status <> 'draft' THEN
    RAISE EXCEPTION 'Inventory version items are immutable after sealing' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inv_immutable_items ON inv_lab.items;
CREATE TRIGGER inv_immutable_items BEFORE INSERT OR UPDATE OR DELETE ON inv_lab.items
FOR EACH ROW EXECUTE FUNCTION inv_lab.reject_mutation_after_seal();

-- Use ONLY from trusted server-side adapter after confirming opaque MainTrack session is Owner.
-- Locks version + active row; a stale upload must fail, never silently compare to V1.
CREATE OR REPLACE FUNCTION inv_lab.seal_version(p_version bigint, p_actor text)
RETURNS bigint LANGUAGE plpgsql SET search_path = pg_catalog, inv_lab AS $$
DECLARE v inv_lab.versions; n bigint;
BEGIN
  SELECT * INTO v FROM inv_lab.versions WHERE id=p_version FOR UPDATE;
  IF NOT FOUND OR v.status <> 'draft' OR v.sealed THEN
    RAISE EXCEPTION 'Only an unsealed draft can be sealed' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO n FROM inv_lab.items WHERE version_id=p_version;
  IF n=0 THEN RAISE EXCEPTION 'Cannot seal an empty inventory' USING ERRCODE='23514'; END IF;
  UPDATE inv_lab.versions SET sealed=true,status='pending',item_count=n WHERE id=p_version;
  INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor)
  VALUES('SEALED',p_version,v.parent_version_id,p_actor);
  RETURN p_version;
END;
$$;

CREATE OR REPLACE FUNCTION inv_lab.publish_version(
  p_version bigint, p_expected_current bigint, p_actor text
) RETURNS bigint LANGUAGE plpgsql SET search_path = pg_catalog, inv_lab AS $$
DECLARE live inv_lab.active; v inv_lab.versions; n bigint;
BEGIN
  -- The active pointer is the sole source of truth.
  SELECT * INTO live FROM inv_lab.active WHERE singleton=true FOR UPDATE;
  IF NOT FOUND OR live.current_version_id IS DISTINCT FROM p_expected_current THEN
    RAISE EXCEPTION 'STALE_BASE: active inventory changed; rebuild the diff' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v FROM inv_lab.versions WHERE id=p_version FOR UPDATE;
  IF NOT FOUND OR v.status<>'pending' OR NOT v.sealed
     OR v.parent_version_id IS DISTINCT FROM p_expected_current THEN
    RAISE EXCEPTION 'Invalid or stale inventory candidate' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO n FROM inv_lab.items WHERE version_id=p_version;
  IF n <> v.item_count OR n=0 THEN
    RAISE EXCEPTION 'Candidate item count changed after validation' USING ERRCODE='23514';
  END IF;
  IF p_expected_current IS NOT NULL THEN
    UPDATE inv_lab.versions SET status='archived',archived_at=now()
    WHERE id=p_expected_current AND status='current';
    IF NOT FOUND THEN RAISE EXCEPTION 'Current inventory status mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE inv_lab.versions SET status='current',approved_by=p_actor,approved_at=now()
  WHERE id=p_version;
  UPDATE inv_lab.active
  SET current_version_id=p_version, generation=generation+1, changed_at=now()
  WHERE singleton=true;
  INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor,metadata)
  VALUES('PUBLISHED',p_version,p_expected_current,p_actor,jsonb_build_object('previous',p_expected_current));
  RETURN p_version;
END;
$$;

-- Read-only diff: compare candidate against recorded base, never against the initial upload.
CREATE OR REPLACE FUNCTION inv_lab.compare_version(p_version bigint)
RETURNS TABLE(code text,change_type text,old_description text,new_description text,
 old_quantity numeric,new_quantity numeric,old_location text,new_location text)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, inv_lab AS $$
DECLARE b bigint;
BEGIN
  SELECT parent_version_id INTO b FROM inv_lab.versions WHERE id=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT coalesce(o.code,n.code),
    CASE WHEN o.code IS NULL THEN 'NEW'
         WHEN n.code IS NULL THEN 'ABSENT'
         WHEN (o.description,o.quantity,o.location) IS DISTINCT FROM
              (n.description,n.quantity,n.location) THEN 'CHANGED'
         ELSE 'UNCHANGED' END,
    o.description,n.description,o.quantity,n.quantity,o.location,n.location
  FROM (SELECT * FROM inv_lab.items WHERE version_id=b) o
  FULL JOIN (SELECT * FROM inv_lab.items WHERE version_id=p_version) n USING(code)
  ORDER BY coalesce(o.code,n.code);
END;
$$;

-- This isolated schema is never published to browser clients.
-- Supabase Auth JWT is NOT used by MainTrack. Client privileges remain denied.
REVOKE ALL ON ALL TABLES IN SCHEMA inv_lab FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inv_lab FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inv_lab FROM PUBLIC;
COMMIT;
