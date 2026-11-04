-- REVIEWED QA-ONLY overlay; install after qa-permanent.sql, never on Production.
-- Existing grants/permissive policies remain unchanged; this only restricts them.
BEGIN;
DO $$
DECLARE t text; r record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND project_ref='szhstrafzkxzstjdcynl') THEN RAISE EXCEPTION 'QA_PROJECT_MISMATCH'; END IF;
 IF to_regprocedure('maintrack_qa_permanent.is_open()') IS NULL THEN RAISE EXCEPTION 'QA_PERMANENT_BASE_REQUIRED'; END IF;
 SELECT * INTO STRICT r FROM pg_roles WHERE rolname='maintrack_qa_inventory_runtime';
 IF r.rolsuper OR r.rolbypassrls OR r.rolcanlogin THEN RAISE EXCEPTION 'QA_RUNTIME_ROLE_UNSAFE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles danger WHERE (danger.rolsuper OR danger.rolbypassrls OR danger.rolname IN('maintrack_qa_cleanup_worker','maintrack_qa_permanent_executor')) AND (pg_has_role('maintrack_qa_inventory_runtime',danger.oid,'MEMBER') OR pg_has_role('maintrack_qa_b2_runtime',danger.oid,'MEMBER'))) THEN RAISE EXCEPTION 'QA_RUNTIME_PRIVILEGE_PATH_UNSAFE'; END IF;
 FOREACH t IN ARRAY ARRAY['active','versions','items','audit','search_budget'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='qa_security_inventory_20261025' AND c.relname=t AND c.relkind='r' AND pg_get_userbyid(c.relowner)<>'maintrack_qa_inventory_runtime') THEN RAISE EXCEPTION 'QA_TABLE_IDENTITY_UNSAFE'; END IF;
  IF has_table_privilege('maintrack_qa_inventory_runtime',format('%I.%I','qa_security_inventory_20261025',t),'TRUNCATE') THEN RAISE EXCEPTION 'QA_TRUNCATE_PRIVILEGE_UNSAFE'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='qa_security_inventory_20261025' AND c.relname=t AND (pg_has_role('maintrack_qa_inventory_runtime',c.relowner,'MEMBER') OR pg_has_role('maintrack_qa_b2_runtime',c.relowner,'MEMBER'))) THEN RAISE EXCEPTION 'QA_RUNTIME_OWNER_PATH_UNSAFE'; END IF;
  EXECUTE format('ALTER TABLE qa_security_inventory_20261025.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY qa_permanent_inventory_lease ON qa_security_inventory_20261025.%I AS RESTRICTIVE FOR ALL TO maintrack_qa_inventory_runtime USING (maintrack_qa_permanent.is_open()) WITH CHECK (maintrack_qa_permanent.is_open())',t);
 END LOOP;
END $$;
COMMIT;
