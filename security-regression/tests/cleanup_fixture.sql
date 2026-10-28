-- Disposable owned cluster fixture only. No credential columns.
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mt_lease_test_actor') THEN CREATE ROLE mt_lease_test_actor NOLOGIN NOSUPERUSER; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres' AND (rolsuper OR rolcreaterole)) THEN RAISE EXCEPTION 'FIXTURE_POSTGRES_MUST_BE_NON_SUPERUSER'; END IF;
END $roles$;
CREATE SCHEMA qa_security_final_20261025;
CREATE SCHEMA qa_security_inventory_20261025;
CREATE TABLE qa_security_final_20261025.mt_users(id uuid PRIMARY KEY,employee_code text,name text,active boolean,must_change boolean,token_version int);
CREATE TABLE qa_security_final_20261025.mt_sessions(token_hash text PRIMARY KEY,user_id uuid,token_version int,expires_at timestamptz);
CREATE TABLE qa_security_final_20261025.qa_scope(singleton boolean PRIMARY KEY CHECK(singleton),preparation text,project_ref text);
INSERT INTO qa_security_final_20261025.qa_scope VALUES(true,'SECURITY_FINAL_20261025','szhstrafzkxzstjdcynl');
CREATE TABLE qa_security_final_20261025.qa_control(singleton boolean PRIMARY KEY CHECK(singleton),active_tests_authorized boolean,approved_until timestamptz,capability_sha256 text,approved_plan_sha256 text,approved_at timestamptz,request_count int,max_requests int,min_spacing_ms int,last_request_at timestamptz);
INSERT INTO qa_security_final_20261025.qa_control(singleton,active_tests_authorized,approved_until) VALUES(true,false,clock_timestamp()-interval '1 hour');
CREATE TABLE qa_security_final_20261025.mt_reports(id bigint PRIMARY KEY,body text);
INSERT INTO qa_security_final_20261025.mt_reports VALUES(1,'fixture baseline');
INSERT INTO qa_security_final_20261025.mt_users VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','90000001','QA_FINAL_OWNER',true,false,1);
CREATE TABLE qa_security_inventory_20261025.versions(id bigint PRIMARY KEY,status text,created_by text,archived_at timestamptz,approved_at timestamptz,approved_by text,excluded_at timestamptz,excluded_by text,sealed boolean NOT NULL DEFAULT false,item_count int NOT NULL DEFAULT 0);
CREATE TABLE qa_security_inventory_20261025.items(version_id bigint REFERENCES qa_security_inventory_20261025.versions,code text,quantity int,PRIMARY KEY(version_id,code));
CREATE TABLE qa_security_inventory_20261025.active(singleton boolean PRIMARY KEY CHECK(singleton),current_version_id bigint REFERENCES qa_security_inventory_20261025.versions,generation bigint,changed_at timestamptz);
INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(1,'archived'),(2,'current');
INSERT INTO qa_security_inventory_20261025.items VALUES(1,'QA-A',1),(2,'QA-A',2),(2,'QA-B',3);
INSERT INTO qa_security_inventory_20261025.active VALUES(true,2,2,'2026-10-25T00:00:00Z');
GRANT USAGE ON SCHEMA qa_security_inventory_20261025,qa_security_final_20261025 TO mt_lease_test_actor;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA qa_security_inventory_20261025,qa_security_final_20261025 TO mt_lease_test_actor;

CREATE TABLE qa_security_inventory_20261025.audit(id bigint PRIMARY KEY,detail text);
CREATE TABLE qa_security_inventory_20261025.search_budget(actor text PRIMARY KEY,requests int);
CREATE TABLE qa_security_inventory_20261025.unscoped_fixture(id int PRIMARY KEY);
INSERT INTO qa_security_inventory_20261025.audit VALUES(1,'baseline evidence');
INSERT INTO qa_security_inventory_20261025.search_budget VALUES('fixture',1);
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON qa_security_inventory_20261025.audit,qa_security_inventory_20261025.search_budget,qa_security_inventory_20261025.unscoped_fixture TO mt_lease_test_actor;
