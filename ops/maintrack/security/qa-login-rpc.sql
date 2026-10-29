-- QA-only, transactional installation. Not part of operational migrations.
BEGIN;
CREATE ROLE maintrack_qa_login_issuer NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA qa_security_final_20261025,maintrack_qa_lease TO maintrack_qa_login_issuer;
GRANT SELECT ON maintrack_qa_lease.runs,maintrack_qa_lease.sessions,qa_security_final_20261025.qa_scope TO maintrack_qa_login_issuer;
GRANT SELECT(id,employee_code,name,active,must_change,token_version) ON qa_security_final_20261025.mt_users TO maintrack_qa_login_issuer;
GRANT UPDATE ON maintrack_qa_lease.runs TO maintrack_qa_login_issuer;
GRANT INSERT ON maintrack_qa_lease.sessions TO maintrack_qa_login_issuer;
GRANT SELECT,INSERT,UPDATE,DELETE ON qa_security_final_20261025.mt_login_attempts,qa_security_final_20261025.mt_sessions TO maintrack_qa_login_issuer;
-- Add policies only for the private NOLOGIN issuer; retain existing runtime policies.
CREATE POLICY qa_login_issuer_users ON qa_security_final_20261025.mt_users FOR SELECT TO maintrack_qa_login_issuer USING(employee_code IN('90000001','90000002') AND starts_with(name,'QA_FINAL_'));
CREATE POLICY qa_login_issuer_counters ON qa_security_final_20261025.mt_login_attempts FOR ALL TO maintrack_qa_login_issuer USING(employee_code IN('90000001','90000002') AND EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE state='ARMED' AND NOT verified AND project_ref='szhstrafzkxzstjdcynl' AND clock_timestamp()<admit_until)) WITH CHECK(employee_code IN('90000001','90000002') AND EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE state='ARMED' AND NOT verified AND project_ref='szhstrafzkxzstjdcynl' AND clock_timestamp()<admit_until));
CREATE POLICY qa_login_issuer_sessions ON qa_security_final_20261025.mt_sessions FOR ALL TO maintrack_qa_login_issuer USING(user_id IN(SELECT id FROM qa_security_final_20261025.mt_users WHERE employee_code IN('90000001','90000002'))) WITH CHECK(user_id IN(SELECT id FROM qa_security_final_20261025.mt_users WHERE employee_code IN('90000001','90000002')) AND EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE state='ARMED' AND NOT verified AND project_ref='szhstrafzkxzstjdcynl' AND clock_timestamp()<admit_until AND expires_at<=admit_until));
-- Invoker guard observes the dedicated definer identity, not a caller-set GUC.
-- No caller receives role membership or access to private ledger tables.
CREATE FUNCTION maintrack_qa_lease.login_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='maintrack_qa_login_issuer' OR pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'QA_DIRECT_AUTH_WRITE_DENIED' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION maintrack_qa_lease.login_write_guard() FROM PUBLIC;
CREATE FUNCTION maintrack_qa_lease.login_mutate(p_run uuid,p_op text,p_code text,p_hash text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE deadline timestamptz; actor record;
BEGIN
 IF session_user<>'maintrack_qa_final_runtime' THEN RAISE EXCEPTION 'QA_CALLER_DENIED'; END IF;
 IF p_op<>'revoke' AND (p_code IS NULL OR p_code NOT IN('90000001','90000002')) THEN RAISE EXCEPTION 'QA_ACTOR_DENIED'; END IF;
 SELECT admit_until INTO STRICT deadline FROM maintrack_qa_lease.runs WHERE id=p_run AND project_ref='szhstrafzkxzstjdcynl' AND state='ARMED' AND NOT verified AND clock_timestamp()<admit_until FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND project_ref='szhstrafzkxzstjdcynl') THEN RAISE EXCEPTION 'QA_PROJECT_DENIED'; END IF;
 IF p_op='revoke' THEN
  IF p_hash IS NULL OR NOT EXISTS(SELECT 1 FROM maintrack_qa_lease.sessions WHERE run_id=p_run AND token_hash=p_hash) THEN RAISE EXCEPTION 'QA_TOKEN_NOT_OWNED'; END IF;
  DELETE FROM qa_security_final_20261025.mt_sessions WHERE token_hash=p_hash;
  RETURN;
 END IF;
 SELECT id,token_version INTO STRICT actor FROM qa_security_final_20261025.mt_users WHERE employee_code=p_code AND starts_with(name,'QA_FINAL_') AND active AND NOT must_change;
 IF p_op='failure' THEN
  INSERT INTO qa_security_final_20261025.mt_login_attempts(employee_code,fail_count,updated_at) VALUES(p_code,1,now()) ON CONFLICT(employee_code) DO UPDATE SET fail_count=CASE WHEN mt_login_attempts.updated_at<=now()-interval '5 minutes' THEN 1 ELSE LEAST(mt_login_attempts.fail_count+1,5) END,updated_at=now(),blocked_until=CASE WHEN (CASE WHEN mt_login_attempts.updated_at<=now()-interval '5 minutes' THEN 1 ELSE mt_login_attempts.fail_count+1 END)>=5 THEN now()+interval '5 minutes' ELSE NULL END;
 ELSIF p_op='reset' THEN DELETE FROM qa_security_final_20261025.mt_login_attempts WHERE employee_code=p_code;
 ELSIF p_op='issue' THEN
  IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR (SELECT count(*) FROM maintrack_qa_lease.sessions WHERE run_id=p_run)>=4 THEN RAISE EXCEPTION 'QA_SESSION_BUDGET_OR_HASH'; END IF;
  INSERT INTO qa_security_final_20261025.mt_sessions(token_hash,user_id,token_version,expires_at) VALUES(p_hash,actor.id,actor.token_version,deadline);
  INSERT INTO maintrack_qa_lease.sessions(run_id,token_hash) VALUES(p_run,p_hash);
 ELSE RAISE EXCEPTION 'QA_OPERATION_DENIED'; END IF;
END $$;
ALTER FUNCTION maintrack_qa_lease.login_mutate(uuid,text,text,text) OWNER TO maintrack_qa_login_issuer;
REVOKE ALL ON FUNCTION maintrack_qa_lease.login_mutate(uuid,text,text,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA maintrack_qa_lease TO maintrack_qa_final_runtime;
GRANT EXECUTE ON FUNCTION maintrack_qa_lease.login_mutate(uuid,text,text,text) TO maintrack_qa_final_runtime;
-- Replace guards only on the two owned authentication tables; preserve other triggers.
DROP TRIGGER qa_lease_statement ON qa_security_final_20261025.mt_sessions;
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_sessions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.login_write_guard();
DROP TRIGGER qa_lease_statement ON qa_security_final_20261025.mt_login_attempts;
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_login_attempts FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.login_write_guard();
COMMIT;
