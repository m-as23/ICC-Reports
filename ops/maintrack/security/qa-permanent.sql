-- Local-reviewed QA-only baseline. Scheduler activation is a separate approved step.
BEGIN;
CREATE ROLE maintrack_qa_permanent_executor NOLOGIN NOINHERIT;
CREATE SCHEMA maintrack_qa_permanent;
REVOKE ALL ON SCHEMA maintrack_qa_permanent FROM PUBLIC;
CREATE TABLE maintrack_qa_permanent.windows(id uuid PRIMARY KEY,admit_until timestamptz NOT NULL,state text NOT NULL CHECK(state IN('ARMED','RECOVERING','FAILED','COMPLETE')),cap_hash text NOT NULL,plan_hash text NOT NULL,attempts int NOT NULL DEFAULT 0,requests int NOT NULL DEFAULT 0,last_request timestamptz,issued int NOT NULL DEFAULT 0,baseline jsonb NOT NULL,error text,started_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX one_pending_qa_window ON maintrack_qa_permanent.windows((true)) WHERE state<>'COMPLETE';
CREATE TABLE maintrack_qa_permanent.sessions(window_id uuid REFERENCES maintrack_qa_permanent.windows,token_hash text PRIMARY KEY);
CREATE TABLE maintrack_qa_permanent.events(at timestamptz DEFAULT clock_timestamp(),window_id uuid,kind text,detail text);
ALTER TABLE maintrack_qa_permanent.windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintrack_qa_permanent.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintrack_qa_permanent.events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION maintrack_qa_permanent.is_open() RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM maintrack_qa_permanent.windows WHERE state='ARMED' AND clock_timestamp()<admit_until) $$;
CREATE FUNCTION maintrack_qa_permanent.counter_state() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT COALESCE(jsonb_agg(jsonb_build_object('employee_code',employee_code,'fail_count',fail_count,'updated_at',updated_at,'blocked_until',blocked_until) ORDER BY employee_code),'[]'::jsonb) FROM qa_security_final_20261025.mt_login_attempts WHERE employee_code IN('90000001','90000002') $$;
CREATE FUNCTION maintrack_qa_permanent.open_window(p_id uuid,p_cap text,p_plan text,p_seconds int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RAISE EXCEPTION 'QA_CONTROLLER_DENIED'; END IF;
 IF p_seconds NOT BETWEEN 1 AND 1200 OR p_cap!~'^[a-f0-9]{64}$' OR p_plan!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'QA_LIMIT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND project_ref='szhstrafzkxzstjdcynl') THEN RAISE EXCEPTION 'QA_PROJECT_MISMATCH'; END IF;
 IF (SELECT count(*) FROM qa_security_final_20261025.mt_users WHERE employee_code IN('90000001','90000002') AND starts_with(name,'QA_FINAL_') AND active AND NOT must_change)<>2 THEN RAISE EXCEPTION 'QA_ACTOR_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM qa_security_final_20261025.mt_sessions s JOIN qa_security_final_20261025.mt_users u ON u.id=s.user_id WHERE u.employee_code IN('90000001','90000002') AND s.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'QA_EXISTING_ACTOR_SESSION'; END IF;
 INSERT INTO maintrack_qa_permanent.windows(id,admit_until,state,cap_hash,plan_hash,baseline) VALUES(p_id,clock_timestamp()+make_interval(secs=>p_seconds),'ARMED',p_cap,p_plan,maintrack_qa_permanent.counter_state());
END $$;
CREATE FUNCTION maintrack_qa_permanent.admit(p_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r maintrack_qa_permanent.windows;
BEGIN
 IF session_user<>'maintrack_qa_b2_runtime' OR current_setting('role') NOT IN('maintrack_qa_final_runtime','maintrack_qa_inventory_runtime') THEN RAISE EXCEPTION 'QA_CALLER_DENIED'; END IF;
 SELECT * INTO r FROM maintrack_qa_permanent.windows WHERE state='ARMED' AND clock_timestamp()<admit_until FOR UPDATE;
 IF r.id IS NULL OR p_hash IS DISTINCT FROM r.cap_hash OR r.requests>=60 OR (r.last_request IS NOT NULL AND clock_timestamp()<r.last_request+interval '2.6 seconds') THEN RETURN false; END IF;
 UPDATE maintrack_qa_permanent.windows SET requests=requests+1,last_request=clock_timestamp() WHERE id=r.id;RETURN true;
END $$;
CREATE FUNCTION maintrack_qa_permanent.mutate(p_op text,p_code text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r maintrack_qa_permanent.windows; actor record;
BEGIN
 IF session_user<>'maintrack_qa_b2_runtime' OR current_setting('role')<>'maintrack_qa_final_runtime' THEN RAISE EXCEPTION 'QA_CALLER_DENIED'; END IF;
 SELECT * INTO STRICT r FROM maintrack_qa_permanent.windows WHERE state='ARMED' AND clock_timestamp()<admit_until FOR UPDATE;
 IF clock_timestamp()>=r.admit_until THEN RAISE EXCEPTION 'QA_LEASE_EXPIRED'; END IF;
 IF p_op='revoke' THEN
  IF NOT EXISTS(SELECT 1 FROM maintrack_qa_permanent.sessions WHERE window_id=r.id AND token_hash=p_hash) THEN RAISE EXCEPTION 'QA_TOKEN_NOT_OWNED'; END IF;
  DELETE FROM qa_security_final_20261025.mt_sessions WHERE token_hash=p_hash;RETURN;
 END IF;
 IF p_code IS NULL OR p_code NOT IN('90000001','90000002') THEN RAISE EXCEPTION 'QA_ACTOR_DENIED'; END IF;
 SELECT id,token_version INTO STRICT actor FROM qa_security_final_20261025.mt_users WHERE employee_code=p_code AND starts_with(name,'QA_FINAL_') AND active AND NOT must_change;
 IF p_op='issue' THEN
  IF r.issued>=4 OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'QA_SESSION_BUDGET'; END IF;
  INSERT INTO qa_security_final_20261025.mt_sessions(token_hash,user_id,token_version,expires_at) VALUES(p_hash,actor.id,actor.token_version,r.admit_until);
  INSERT INTO maintrack_qa_permanent.sessions VALUES(r.id,p_hash);UPDATE maintrack_qa_permanent.windows SET issued=issued+1 WHERE id=r.id;
 ELSIF p_op='failure' THEN
  INSERT INTO qa_security_final_20261025.mt_login_attempts(employee_code,fail_count,updated_at) VALUES(p_code,1,now()) ON CONFLICT(employee_code) DO UPDATE SET fail_count=CASE WHEN mt_login_attempts.updated_at<=now()-interval '5 minutes' THEN 1 ELSE LEAST(mt_login_attempts.fail_count+1,5) END,updated_at=now(),blocked_until=CASE WHEN (CASE WHEN mt_login_attempts.updated_at<=now()-interval '5 minutes' THEN 1 ELSE mt_login_attempts.fail_count+1 END)>=5 THEN now()+interval '5 minutes' ELSE NULL END;
 ELSIF p_op='reset' THEN DELETE FROM qa_security_final_20261025.mt_login_attempts WHERE employee_code=p_code;
 ELSE RAISE EXCEPTION 'QA_OPERATION_DENIED'; END IF;
END $$;
-- Durable attempt and revocation commits survive later counter restoration failure.
CREATE PROCEDURE maintrack_qa_permanent.tick() LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE r record; problem text;
BEGIN
 IF NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RAISE EXCEPTION 'QA_WORKER_DENIED'; END IF;
 FOR r IN SELECT * FROM maintrack_qa_permanent.windows WHERE state<>'COMPLETE' AND admit_until<=clock_timestamp() AND attempts<2 LOOP
  UPDATE maintrack_qa_permanent.windows SET state='RECOVERING',attempts=attempts+1 WHERE id=r.id;COMMIT;
  BEGIN
   SET LOCAL lock_timeout='2s';
   DELETE FROM qa_security_final_20261025.mt_sessions WHERE token_hash IN(SELECT token_hash FROM maintrack_qa_permanent.sessions WHERE window_id=r.id);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS problem=RETURNED_SQLSTATE;UPDATE maintrack_qa_permanent.windows SET state='FAILED',error=problem WHERE id=r.id;
  END;COMMIT;
  BEGIN
   SET LOCAL lock_timeout='2s';
   IF EXISTS(SELECT 1 FROM qa_security_final_20261025.mt_sessions WHERE token_hash IN(SELECT token_hash FROM maintrack_qa_permanent.sessions WHERE window_id=r.id)) THEN RAISE EXCEPTION 'QA_SESSIONS_REMAIN'; END IF;
   DELETE FROM qa_security_final_20261025.mt_login_attempts WHERE employee_code IN('90000001','90000002');
   INSERT INTO qa_security_final_20261025.mt_login_attempts(employee_code,fail_count,updated_at,blocked_until) SELECT employee_code,fail_count,updated_at,blocked_until FROM jsonb_to_recordset(r.baseline) AS x(employee_code text,fail_count int,updated_at timestamptz,blocked_until timestamptz);
   IF maintrack_qa_permanent.counter_state() IS DISTINCT FROM r.baseline THEN RAISE EXCEPTION 'QA_COUNTER_RESTORE_MISMATCH'; END IF;
   DELETE FROM maintrack_qa_permanent.sessions WHERE window_id=r.id;
   UPDATE maintrack_qa_permanent.windows SET state='COMPLETE',error=NULL WHERE id=r.id;
   INSERT INTO maintrack_qa_permanent.events(window_id,kind) VALUES(r.id,'RECOVERY_VERIFIED');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS problem=RETURNED_SQLSTATE;UPDATE maintrack_qa_permanent.windows SET state='FAILED',error=problem WHERE id=r.id;INSERT INTO maintrack_qa_permanent.events(window_id,kind,detail) VALUES(r.id,'RECOVERY_FAILED',problem);
  END;COMMIT;
 END LOOP;
END $$;
-- Dedicated non-login definer, scoped authentication columns only.
GRANT USAGE,CREATE ON SCHEMA maintrack_qa_permanent TO maintrack_qa_permanent_executor;
GRANT USAGE ON SCHEMA qa_security_final_20261025 TO maintrack_qa_permanent_executor;
GRANT ALL ON ALL TABLES IN SCHEMA maintrack_qa_permanent TO maintrack_qa_permanent_executor;
GRANT SELECT ON qa_security_final_20261025.qa_scope TO maintrack_qa_permanent_executor;
CREATE POLICY qa_permanent_executor ON qa_security_final_20261025.qa_scope FOR SELECT TO maintrack_qa_permanent_executor USING(project_ref='szhstrafzkxzstjdcynl');
GRANT SELECT(id,employee_code,name,active,must_change,token_version) ON qa_security_final_20261025.mt_users TO maintrack_qa_permanent_executor;
GRANT SELECT,INSERT,UPDATE,DELETE ON qa_security_final_20261025.mt_login_attempts TO maintrack_qa_permanent_executor;
GRANT SELECT,INSERT,DELETE ON qa_security_final_20261025.mt_sessions TO maintrack_qa_permanent_executor;
CREATE POLICY qa_private_worker ON maintrack_qa_permanent.windows TO maintrack_qa_permanent_executor,maintrack_qa_cleanup_worker USING(true) WITH CHECK(true);
CREATE POLICY qa_private_worker ON maintrack_qa_permanent.sessions TO maintrack_qa_permanent_executor,maintrack_qa_cleanup_worker USING(true) WITH CHECK(true);
CREATE POLICY qa_private_worker ON maintrack_qa_permanent.events TO maintrack_qa_permanent_executor,maintrack_qa_cleanup_worker USING(true) WITH CHECK(true);
CREATE POLICY qa_permanent_executor ON qa_security_final_20261025.mt_users TO maintrack_qa_permanent_executor USING(employee_code IN('90000001','90000002') AND starts_with(name,'QA_FINAL_'));
CREATE POLICY qa_permanent_executor ON qa_security_final_20261025.mt_login_attempts TO maintrack_qa_permanent_executor USING(employee_code IN('90000001','90000002'));
CREATE POLICY qa_permanent_executor ON qa_security_final_20261025.mt_sessions TO maintrack_qa_permanent_executor USING(user_id IN(SELECT id FROM qa_security_final_20261025.mt_users WHERE employee_code IN('90000001','90000002')));
ALTER FUNCTION maintrack_qa_permanent.is_open() OWNER TO maintrack_qa_permanent_executor;
ALTER FUNCTION maintrack_qa_permanent.counter_state() OWNER TO maintrack_qa_permanent_executor;
ALTER FUNCTION maintrack_qa_permanent.open_window(uuid,text,text,int) OWNER TO maintrack_qa_permanent_executor;
ALTER FUNCTION maintrack_qa_permanent.admit(text) OWNER TO maintrack_qa_permanent_executor;
ALTER FUNCTION maintrack_qa_permanent.mutate(text,text,text) OWNER TO maintrack_qa_permanent_executor;
GRANT USAGE ON SCHEMA maintrack_qa_permanent TO maintrack_qa_cleanup_worker;
GRANT ALL ON ALL TABLES IN SCHEMA maintrack_qa_permanent TO maintrack_qa_cleanup_worker;
CREATE FUNCTION maintrack_qa_permanent.auth_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN IF current_user='maintrack_qa_permanent_executor' OR pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RETURN NULL; END IF;RAISE EXCEPTION 'QA_DIRECT_WRITE_DENIED';END $$;
DROP TRIGGER IF EXISTS qa_lease_statement ON qa_security_final_20261025.mt_sessions;
DROP TRIGGER IF EXISTS qa_lease_statement ON qa_security_final_20261025.mt_login_attempts;
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_sessions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_permanent.auth_write_guard();
CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON qa_security_final_20261025.mt_login_attempts FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_permanent.auth_write_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA maintrack_qa_permanent FROM PUBLIC;
REVOKE ALL ON PROCEDURE maintrack_qa_permanent.tick() FROM PUBLIC;
GRANT USAGE ON SCHEMA maintrack_qa_permanent TO maintrack_qa_final_runtime,maintrack_qa_inventory_runtime,maintrack_qa_cleanup_worker;
GRANT EXECUTE ON FUNCTION maintrack_qa_permanent.is_open(),maintrack_qa_permanent.admit(text) TO maintrack_qa_final_runtime,maintrack_qa_inventory_runtime;
GRANT EXECUTE ON FUNCTION maintrack_qa_permanent.mutate(text,text,text) TO maintrack_qa_final_runtime;
GRANT EXECUTE ON FUNCTION maintrack_qa_permanent.open_window(uuid,text,text,int) TO maintrack_qa_cleanup_worker;
GRANT EXECUTE ON PROCEDURE maintrack_qa_permanent.tick() TO maintrack_qa_cleanup_worker;
REVOKE INSERT,UPDATE,DELETE ON qa_security_final_20261025.mt_users,qa_security_final_20261025.mt_sessions,qa_security_final_20261025.mt_login_attempts FROM maintrack_qa_final_runtime;
-- Restrictive policies compose with existing runtime policies, never replace them.
CREATE POLICY qa_permanent_users ON qa_security_final_20261025.mt_users AS RESTRICTIVE TO maintrack_qa_final_runtime,maintrack_qa_inventory_runtime USING(maintrack_qa_permanent.is_open() AND employee_code IN('90000001','90000002'));
CREATE POLICY qa_permanent_sessions ON qa_security_final_20261025.mt_sessions AS RESTRICTIVE TO maintrack_qa_final_runtime,maintrack_qa_inventory_runtime USING(maintrack_qa_permanent.is_open() AND expires_at>clock_timestamp());
CREATE POLICY qa_permanent_counters ON qa_security_final_20261025.mt_login_attempts AS RESTRICTIVE TO maintrack_qa_final_runtime USING(maintrack_qa_permanent.is_open() AND employee_code IN('90000001','90000002'));
COMMIT;
