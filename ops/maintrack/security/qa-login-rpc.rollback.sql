-- Only for the matching fresh-role installation, after source restoration and
-- separately verified session/counter baseline cleanup. Never run independently.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE NOT verified) OR EXISTS(SELECT 1 FROM qa_security_final_20261025.mt_sessions WHERE expires_at>now()) THEN RAISE EXCEPTION 'QA_RESTORE_NOT_CLOSED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND project_ref='szhstrafzkxzstjdcynl') THEN RAISE EXCEPTION 'QA_PROJECT_MISMATCH'; END IF;
END $$;
DROP TRIGGER qa_lease_statement ON qa_security_final_20261025.mt_sessions;
DROP TRIGGER qa_lease_statement ON qa_security_final_20261025.mt_login_attempts;
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_sessions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.write_guard();
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_login_attempts FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.write_guard();
DROP FUNCTION maintrack_qa_lease.login_mutate(uuid,text,text,text);
DROP FUNCTION maintrack_qa_lease.login_write_guard();
DROP POLICY qa_login_issuer_users ON qa_security_final_20261025.mt_users;
DROP POLICY qa_login_issuer_counters ON qa_security_final_20261025.mt_login_attempts;
DROP POLICY qa_login_issuer_sessions ON qa_security_final_20261025.mt_sessions;
DROP OWNED BY maintrack_qa_login_issuer;
DROP ROLE maintrack_qa_login_issuer;
-- Installation preflight must prove this USAGE was absent before installation.
REVOKE USAGE ON SCHEMA maintrack_qa_lease FROM maintrack_qa_final_runtime;
COMMIT;
