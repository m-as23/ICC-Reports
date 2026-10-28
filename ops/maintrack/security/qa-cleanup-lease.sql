-- DESIGN 2 / REVIEW ONLY. Fresh cloud approval and real pg_cron proof required.
-- Inventory-only admission. New statements/rows are denied at admit_until; an
-- already executing transaction can commit later. No commit-deadline guarantee.
-- Prepare requires external provider-ref verification, which is not DB attestation.
CREATE ROLE maintrack_qa_cleanup_worker NOLOGIN;
GRANT maintrack_qa_cleanup_worker TO postgres;
CREATE SCHEMA maintrack_qa_lease;
REVOKE ALL ON SCHEMA maintrack_qa_lease FROM PUBLIC;
CREATE TABLE maintrack_qa_lease.runs(
 id uuid PRIMARY KEY, project_ref text NOT NULL CHECK(project_ref='szhstrafzkxzstjdcynl'),
 started_at timestamptz NOT NULL, admit_until timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN('PREPARED','ARMED','CLEANING','COMPLETE','FAILED')),
 baseline jsonb NOT NULL, attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
 job_id bigint, finished_at timestamptz, verified boolean NOT NULL DEFAULT false,
 late boolean NOT NULL DEFAULT false, last_error text, heartbeat_at timestamptz,
 CHECK(started_at<admit_until AND admit_until<expires_at AND expires_at-started_at<=interval '45 minutes')
);
CREATE UNIQUE INDEX only_one_unverified_run ON maintrack_qa_lease.runs((true)) WHERE NOT verified;
CREATE TABLE maintrack_qa_lease.sessions(run_id uuid NOT NULL REFERENCES maintrack_qa_lease.runs(id),token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'));
CREATE TABLE maintrack_qa_lease.own_versions(run_id uuid NOT NULL REFERENCES maintrack_qa_lease.runs(id),version_id bigint PRIMARY KEY);
CREATE TABLE maintrack_qa_lease.events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,run_id uuid REFERENCES maintrack_qa_lease.runs(id),at timestamptz NOT NULL DEFAULT clock_timestamp(),kind text NOT NULL,detail jsonb NOT NULL DEFAULT '{}');
REVOKE ALL ON ALL TABLES IN SCHEMA maintrack_qa_lease FROM PUBLIC;
CREATE FUNCTION maintrack_qa_lease.snapshot() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object(
 'active',(SELECT to_jsonb(a) FROM qa_security_inventory_20261025.active a WHERE singleton),
 'versions',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'archived_at',archived_at,'approved_at',approved_at,'approved_by',approved_by,'excluded_at',excluded_at,'excluded_by',excluded_by) ORDER BY id) FROM qa_security_inventory_20261025.versions),
 'items_digest',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY version_id,code)::text,'[]'),'UTF8')),'hex') FROM qa_security_inventory_20261025.items i))
$fn$;
CREATE FUNCTION maintrack_qa_lease.admitting() RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE state='ARMED' AND clock_timestamp()<admit_until AND NOT verified)
$fn$;
CREATE FUNCTION maintrack_qa_lease.write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r maintrack_qa_lease.runs; old_id bigint; new_id bigint;
BEGIN
 IF pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN
  IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSE RETURN COALESCE(NEW,OLD); END IF;
 END IF;
 IF TG_TABLE_SCHEMA='qa_security_final_20261025' AND (TG_TABLE_NAME<>'qa_control' OR TG_OP<>'UPDATE') THEN RAISE EXCEPTION 'QA_CORE_WRITES_DENIED' USING ERRCODE='42501'; END IF;
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'QA_TRUNCATE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM maintrack_qa_lease.runs WHERE NOT verified;
 IF r.id IS NULL OR r.state<>'ARMED' OR clock_timestamp()>=r.admit_until THEN RAISE EXCEPTION 'QA_LEASE_CLOSED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_SCHEMA='qa_security_inventory_20261025' AND TG_TABLE_NAME NOT IN('active','versions','items') THEN
  IF TG_TABLE_NAME='audit' AND TG_OP='INSERT' THEN
   IF TG_LEVEL='STATEMENT' THEN RETURN NULL; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'QA_INVENTORY_TABLE_NOT_SCOPED' USING ERRCODE='42501';
 END IF;
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='qa_control' THEN
  IF (to_jsonb(NEW)-ARRAY['request_count','last_request_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['request_count','last_request_at'])
   OR OLD.request_count IS NULL OR OLD.max_requests IS NULL OR OLD.min_spacing_ms IS NULL OR OLD.min_spacing_ms<0 OR NEW.request_count IS DISTINCT FROM OLD.request_count+1 OR OLD.request_count>=OLD.max_requests
   OR NOT COALESCE(OLD.active_tests_authorized,false) OR OLD.approved_until IS NULL OR clock_timestamp()>=OLD.approved_until
   OR OLD.approved_plan_sha256 IS NULL OR OLD.approved_plan_sha256!~'^[a-f0-9]{64}$'
   OR NEW.last_request_at IS NULL OR NEW.last_request_at<statement_timestamp() OR NEW.last_request_at>clock_timestamp()
   OR (OLD.last_request_at IS NOT NULL AND NEW.last_request_at<OLD.last_request_at+OLD.min_spacing_ms*interval '1 millisecond')
   THEN RAISE EXCEPTION 'QA_CONTROL_RESERVATION_ONLY' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='items' THEN
  IF TG_OP<>'INSERT' THEN old_id:=OLD.version_id; END IF;
  IF TG_OP<>'DELETE' THEN new_id:=NEW.version_id; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.baseline->'versions')v WHERE (v->>'id')::bigint IN(old_id,new_id)) THEN RAISE EXCEPTION 'QA_BASELINE_ITEMS_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY[old_id,new_id])i WHERE i IS NOT NULL AND NOT EXISTS(SELECT 1 FROM maintrack_qa_lease.own_versions o WHERE o.run_id=r.id AND o.version_id=i)) THEN RAISE EXCEPTION 'QA_UNOWNED_VERSION'; END IF;
 ELSIF TG_TABLE_NAME='versions' THEN
  IF TG_OP='INSERT' THEN
   -- Serialize the version budget without taking the active-pointer lock.
   PERFORM 1 FROM maintrack_qa_lease.runs WHERE id=r.id FOR UPDATE;
   IF (SELECT count(*) FROM maintrack_qa_lease.own_versions WHERE run_id=r.id)>=2 THEN RAISE EXCEPTION 'QA_VERSION_BUDGET_EXCEEDED'; END IF;
   INSERT INTO maintrack_qa_lease.own_versions VALUES(r.id,NEW.id);
  ELSIF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'QA_VERSION_DELETE_OR_REKEY_DENIED';
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(r.baseline->'versions')v WHERE (v->>'id')::bigint=OLD.id) AND (to_jsonb(NEW)-ARRAY['status','archived_at','approved_at','approved_by','excluded_at','excluded_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','archived_at','approved_at','approved_by','excluded_at','excluded_by']) THEN RAISE EXCEPTION 'QA_VERSION_SOURCE_IMMUTABLE'; END IF;
 ELSIF TG_TABLE_NAME='active' AND TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'QA_ACTIVE_STRUCTURE_IMMUTABLE';
 END IF;
 RETURN COALESCE(NEW,OLD);
END $fn$;
DO $install$
DECLARE t record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('qa_security_final_20261025','qa_security_inventory_20261025') AND c.relkind IN('r','p') LOOP
  EXECUTE format('CREATE TRIGGER qa_lease_statement BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.write_guard()',t.nspname,t.relname);
  IF t.nspname='qa_security_inventory_20261025' OR t.relname='qa_control' THEN EXECUTE format('CREATE TRIGGER qa_lease_row BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION maintrack_qa_lease.write_guard()',t.nspname,t.relname); END IF;
 END LOOP;
END $install$;
-- This procedure MUST be a top-level CALL, using the private member login. It is
-- SECURITY INVOKER with no SET clause so transaction control is legal.
CREATE FUNCTION maintrack_qa_lease.lock_inventory() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 LOCK TABLE qa_security_inventory_20261025.active,qa_security_inventory_20261025.versions,qa_security_inventory_20261025.items IN SHARE MODE;
END $fn$;
CREATE PROCEDURE maintrack_qa_lease.sweep(p_id uuid) LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE r maintrack_qa_lease.runs; base jsonb; source_digest text; n int; err text;
BEGIN
 IF NOT pg_catalog.pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RAISE EXCEPTION 'QA_WORKER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT pg_catalog.pg_try_advisory_lock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text)) THEN RETURN; END IF;
 SELECT * INTO STRICT r FROM maintrack_qa_lease.runs WHERE id=p_id FOR UPDATE;
 IF r.verified THEN PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text)); COMMIT; RETURN; END IF;
 UPDATE maintrack_qa_lease.runs SET heartbeat_at=pg_catalog.clock_timestamp() WHERE id=p_id;
 IF r.state='PREPARED' AND pg_catalog.clock_timestamp()<r.expires_at THEN
  INSERT INTO maintrack_qa_lease.events(run_id,kind) VALUES(p_id,'WORKER_HEARTBEAT');
  COMMIT;
  PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text)); RETURN;
 END IF;
 IF r.state='ARMED' AND pg_catalog.clock_timestamp()<r.admit_until THEN COMMIT; PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text)); RETURN; END IF;
 IF r.attempts>=2 THEN COMMIT; PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text)); RETURN; END IF;
 UPDATE maintrack_qa_lease.runs SET attempts=attempts+1,state='CLEANING',late=pg_catalog.clock_timestamp()>expires_at WHERE id=p_id;
 INSERT INTO maintrack_qa_lease.events(run_id,kind) VALUES(p_id,'ATTEMPT_DURABLE');
 COMMIT;
 -- Attempt is durable even if control/session expiry blocks or this backend dies.
 BEGIN
  SET LOCAL lock_timeout='2s';
  UPDATE qa_security_final_20261025.qa_control SET active_tests_authorized=false,approved_until=LEAST(approved_until,pg_catalog.clock_timestamp()) WHERE singleton;
  UPDATE qa_security_final_20261025.mt_sessions SET expires_at=LEAST(expires_at,pg_catalog.clock_timestamp()) WHERE token_hash IN(SELECT token_hash FROM maintrack_qa_lease.sessions WHERE run_id=p_id);
 EXCEPTION WHEN query_canceled OR OTHERS THEN
  GET STACKED DIAGNOSTICS err=RETURNED_SQLSTATE;
  UPDATE maintrack_qa_lease.runs SET state='FAILED',last_error=err WHERE id=p_id;
 END;
 COMMIT;
 IF (SELECT state FROM maintrack_qa_lease.runs WHERE id=p_id)='CLEANING' THEN
  BEGIN
   SET LOCAL lock_timeout='2s';
   -- Wait for in-flight writers before observing rollback state. These locks
   -- conflict with their RowExclusive locks and remain through verification.
   -- Private definer obtains the lock without granting item UPDATE/MAINTAIN.
   PERFORM maintrack_qa_lease.lock_inventory();
   PERFORM 1 FROM qa_security_inventory_20261025.active WHERE singleton FOR UPDATE;
   base:=r.baseline;
   IF EXISTS(SELECT 1 FROM qa_security_inventory_20261025.versions v WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(base->'versions')o WHERE (o->>'id')::bigint=v.id) AND NOT EXISTS(SELECT 1 FROM maintrack_qa_lease.own_versions o WHERE o.run_id=p_id AND o.version_id=v.id)) THEN RAISE EXCEPTION 'QA_UNOWNED_VERSION'; END IF;
   SELECT count(*) INTO n FROM maintrack_qa_lease.own_versions WHERE run_id=p_id;
   IF n>2 THEN RAISE EXCEPTION 'QA_VERSION_BUDGET_EXCEEDED'; END IF;
   UPDATE qa_security_inventory_20261025.versions v SET status='archived',archived_at=COALESCE(archived_at,pg_catalog.clock_timestamp()),excluded_at=COALESCE(excluded_at,pg_catalog.clock_timestamp()),excluded_by='QA_LEASE_CLEANUP' WHERE EXISTS(SELECT 1 FROM maintrack_qa_lease.own_versions o WHERE o.run_id=p_id AND o.version_id=v.id);
   UPDATE qa_security_inventory_20261025.versions v SET status=o.status,archived_at=o.archived_at,approved_at=o.approved_at,approved_by=o.approved_by,excluded_at=o.excluded_at,excluded_by=o.excluded_by FROM pg_catalog.jsonb_to_recordset(base->'versions') AS o(id bigint,status text,archived_at timestamptz,approved_at timestamptz,approved_by text,excluded_at timestamptz,excluded_by text) WHERE v.id=o.id;
   UPDATE qa_security_inventory_20261025.active SET current_version_id=(base->'active'->>'current_version_id')::bigint,generation=(base->'active'->>'generation')::bigint,changed_at=(base->'active'->>'changed_at')::timestamptz WHERE singleton;
   SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY version_id,code)::text,'[]'),'UTF8')),'hex') INTO source_digest FROM qa_security_inventory_20261025.items i WHERE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(base->'versions')o WHERE (o->>'id')::bigint=i.version_id);
   IF source_digest IS DISTINCT FROM base->>'items_digest' OR (SELECT pg_catalog.to_jsonb(a) FROM qa_security_inventory_20261025.active a WHERE singleton) IS DISTINCT FROM base->'active' THEN RAISE EXCEPTION 'QA_BASELINE_VERIFICATION_FAILED'; END IF;
   IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'status',status,'archived_at',archived_at,'approved_at',approved_at,'approved_by',approved_by,'excluded_at',excluded_at,'excluded_by',excluded_by) ORDER BY id) FROM qa_security_inventory_20261025.versions v WHERE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(base->'versions')o WHERE (o->>'id')::bigint=v.id)) IS DISTINCT FROM base->'versions' THEN RAISE EXCEPTION 'QA_ORIGINAL_VERSION_METADATA_DIFFERS'; END IF;
   IF EXISTS(SELECT 1 FROM qa_security_inventory_20261025.versions v JOIN maintrack_qa_lease.own_versions o ON o.version_id=v.id WHERE o.run_id=p_id AND (v.status IS DISTINCT FROM 'archived' OR v.excluded_at IS NULL OR v.excluded_by IS DISTINCT FROM 'QA_LEASE_CLEANUP')) THEN RAISE EXCEPTION 'QA_ARCHIVE_VERIFICATION_FAILED'; END IF;
   IF EXISTS(SELECT 1 FROM qa_security_final_20261025.mt_sessions s JOIN maintrack_qa_lease.sessions l USING(token_hash) WHERE l.run_id=p_id AND s.expires_at>pg_catalog.clock_timestamp()) THEN RAISE EXCEPTION 'QA_ACTIVE_SESSIONS_REMAIN'; END IF;
   IF EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_control WHERE singleton AND active_tests_authorized) THEN RAISE EXCEPTION 'QA_CHANNEL_OPEN'; END IF;
   UPDATE maintrack_qa_lease.runs SET state='COMPLETE',verified=true,finished_at=pg_catalog.clock_timestamp(),late=pg_catalog.clock_timestamp()>expires_at,last_error=NULL WHERE id=p_id;
   INSERT INTO maintrack_qa_lease.events(run_id,kind) VALUES(p_id,'CLEANUP_VERIFIED');
  EXCEPTION WHEN query_canceled OR OTHERS THEN
   GET STACKED DIAGNOSTICS err=RETURNED_SQLSTATE;
   UPDATE maintrack_qa_lease.runs SET state='FAILED',last_error=err,late=pg_catalog.clock_timestamp()>expires_at WHERE id=p_id;
   INSERT INTO maintrack_qa_lease.events(run_id,kind,detail) VALUES(p_id,'CLEANUP_FAILED',pg_catalog.jsonb_build_object('sqlstate',err));
  END;
  COMMIT;
 END IF;
 -- Cleanup result is already committed; scheduler failure cannot undo it.
 BEGIN
  IF r.job_id IS NOT NULL AND EXISTS(SELECT 1 FROM maintrack_qa_lease.runs WHERE id=p_id AND (verified OR attempts>=2)) THEN EXECUTE 'SELECT cron.unschedule($1)' USING r.job_id; END IF;
 EXCEPTION WHEN query_canceled OR OTHERS THEN
  GET STACKED DIAGNOSTICS err=RETURNED_SQLSTATE;
  INSERT INTO maintrack_qa_lease.events(run_id,kind,detail) VALUES(p_id,'SCHEDULER_MAINTENANCE_FAILED',pg_catalog.jsonb_build_object('sqlstate',err));
 END;
 COMMIT;
 PERFORM pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('maintrack_qa_lease'),pg_catalog.hashtext(p_id::text));
END $fn$;
CREATE FUNCTION maintrack_qa_lease.prepare(p_id uuid,p_provider_ref text) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE job bigint; began timestamptz:=clock_timestamp();
BEGIN
 IF NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RAISE EXCEPTION 'QA_WORKER_REQUIRED'; END IF;
 IF p_provider_ref IS DISTINCT FROM 'szhstrafzkxzstjdcynl' OR NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND preparation='SECURITY_FINAL_20261025' AND project_ref=p_provider_ref) OR NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_control WHERE singleton AND NOT active_tests_authorized) THEN RAISE EXCEPTION 'QA_BINDING_OR_BASELINE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'SERVER_SCHEDULER_UNAVAILABLE'; END IF;
 INSERT INTO maintrack_qa_lease.runs(id,project_ref,started_at,admit_until,expires_at,state,baseline) VALUES(p_id,p_provider_ref,began,began+interval '1 minute',began+interval '5 minutes','PREPARED',maintrack_qa_lease.snapshot());
 EXECUTE 'SELECT cron.schedule($1,$2,$3)' INTO job USING 'mtqa_'||p_id::text,'* * * * *','CALL maintrack_qa_lease.sweep('||quote_literal(p_id)||'::uuid);';
 IF job IS NULL THEN RAISE EXCEPTION 'SERVER_JOB_NOT_REGISTERED'; END IF;
 UPDATE maintrack_qa_lease.runs SET job_id=job WHERE id=p_id;
 RETURN job;
END $fn$;
CREATE FUNCTION maintrack_qa_lease.arm(p_id uuid,p_scope_sha text,p_cap_sha text,p_specs jsonb,p_admit_seconds int DEFAULT 180,p_deadline_seconds int DEFAULT 420) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r maintrack_qa_lease.runs; began timestamptz:=clock_timestamp(); spec jsonb; actor uuid; actor_version int;
BEGIN
 IF NOT pg_has_role(session_user,'maintrack_qa_cleanup_worker','MEMBER') THEN RAISE EXCEPTION 'QA_WORKER_REQUIRED'; END IF;
 IF p_admit_seconds IS NULL OR p_deadline_seconds IS NULL OR p_scope_sha IS NULL OR p_cap_sha IS NULL OR p_specs IS NULL OR jsonb_typeof(p_specs)<>'array' OR p_admit_seconds NOT BETWEEN 60 AND 1200 OR p_deadline_seconds<p_admit_seconds+120 OR p_deadline_seconds>2700 OR p_scope_sha!~'^[a-f0-9]{64}$' OR p_cap_sha!~'^[a-f0-9]{64}$' OR jsonb_array_length(p_specs) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'INVALID_APPROVED_LEASE'; END IF;
 SELECT * INTO STRICT r FROM maintrack_qa_lease.runs WHERE id=p_id FOR UPDATE;
 IF r.state<>'PREPARED' OR r.heartbeat_at IS NULL OR r.heartbeat_at<began-interval '90 seconds' OR began>=r.expires_at OR maintrack_qa_lease.snapshot() IS DISTINCT FROM r.baseline THEN RAISE EXCEPTION 'WORKER_HEARTBEAT_OR_BASELINE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_scope WHERE singleton AND preparation='SECURITY_FINAL_20261025' AND project_ref=r.project_ref) OR NOT EXISTS(SELECT 1 FROM qa_security_final_20261025.qa_control WHERE singleton AND NOT active_tests_authorized) THEN RAISE EXCEPTION 'QA_BINDING_OR_BASELINE_INVALID'; END IF;
 FOR spec IN SELECT * FROM jsonb_array_elements(p_specs) LOOP
  IF spec->>'code' IS NULL OR spec->>'tokenHash' IS NULL OR spec->>'code' NOT IN('90000001','90000002','90000003') OR (spec->>'tokenHash')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'UNAPPROVED_SYNTHETIC_SESSION'; END IF;
  SELECT id,token_version INTO STRICT actor,actor_version FROM qa_security_final_20261025.mt_users WHERE employee_code=spec->>'code' AND starts_with(name,'QA_FINAL_') AND active AND NOT must_change;
  INSERT INTO qa_security_final_20261025.mt_sessions(token_hash,user_id,token_version,expires_at) VALUES(spec->>'tokenHash',actor,actor_version,began+make_interval(secs=>p_admit_seconds));
  INSERT INTO maintrack_qa_lease.sessions VALUES(p_id,spec->>'tokenHash');
 END LOOP;
 UPDATE maintrack_qa_lease.runs SET started_at=began,admit_until=began+make_interval(secs=>p_admit_seconds),expires_at=began+make_interval(secs=>p_deadline_seconds),state='ARMED' WHERE id=p_id;
 UPDATE qa_security_final_20261025.qa_control SET active_tests_authorized=true,capability_sha256=p_cap_sha,approved_plan_sha256=p_scope_sha,approved_at=began,approved_until=began+make_interval(secs=>p_admit_seconds),request_count=0,max_requests=60,min_spacing_ms=2600 WHERE singleton;
 INSERT INTO maintrack_qa_lease.events(run_id,kind) VALUES(p_id,'ARMED_AFTER_WORKER_HEARTBEAT');
 RETURN jsonb_build_object('id',p_id,'admitUntil',began+make_interval(secs=>p_admit_seconds),'cleanupDeadline',began+make_interval(secs=>p_deadline_seconds));
END $fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA maintrack_qa_lease FROM PUBLIC;
REVOKE ALL ON PROCEDURE maintrack_qa_lease.sweep(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA maintrack_qa_lease,qa_security_final_20261025,qa_security_inventory_20261025 TO maintrack_qa_cleanup_worker;
GRANT SELECT,UPDATE ON maintrack_qa_lease.runs TO maintrack_qa_cleanup_worker;
GRANT SELECT ON maintrack_qa_lease.sessions,maintrack_qa_lease.own_versions TO maintrack_qa_cleanup_worker;
GRANT INSERT ON maintrack_qa_lease.events TO maintrack_qa_cleanup_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA maintrack_qa_lease TO maintrack_qa_cleanup_worker;
GRANT SELECT,UPDATE ON qa_security_inventory_20261025.active,qa_security_inventory_20261025.versions,qa_security_final_20261025.qa_control TO maintrack_qa_cleanup_worker;
GRANT SELECT ON qa_security_inventory_20261025.items TO maintrack_qa_cleanup_worker;
GRANT SELECT(token_hash,expires_at),UPDATE(expires_at) ON qa_security_final_20261025.mt_sessions TO maintrack_qa_cleanup_worker;
GRANT EXECUTE ON FUNCTION maintrack_qa_lease.prepare(uuid,text),maintrack_qa_lease.arm(uuid,text,text,jsonb,integer,integer) TO maintrack_qa_cleanup_worker;
GRANT EXECUTE ON PROCEDURE maintrack_qa_lease.sweep(uuid) TO maintrack_qa_cleanup_worker;
GRANT EXECUTE ON FUNCTION maintrack_qa_lease.lock_inventory() TO maintrack_qa_cleanup_worker;
-- Cron schema/function privileges must be confirmed for the actual postgres job
-- owner before prepare. No runtime receives lease schema usage or worker membership.
GRANT INSERT ON maintrack_qa_lease.runs TO maintrack_qa_cleanup_worker;
GRANT EXECUTE ON FUNCTION maintrack_qa_lease.snapshot() TO maintrack_qa_cleanup_worker;
DO $cron_grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  GRANT USAGE ON SCHEMA cron TO maintrack_qa_cleanup_worker;
  GRANT EXECUTE ON FUNCTION cron.schedule(text,text,text),cron.unschedule(bigint) TO maintrack_qa_cleanup_worker;
 END IF;
END $cron_grants$;
-- Cron command is one top-level CALL. Its login must have an independently
-- verified connection-level statement_timeout; SET; CALL in one query string
-- would prevent transaction control. Local tests inject cancellation explicitly.




GRANT SELECT ON qa_security_final_20261025.qa_scope TO maintrack_qa_cleanup_worker;
-- REVIEW BLOCKERS beyond SQL verification:
-- pg_cron delivery/connection timeout and maintenance permissions need live proof.
-- A failed terminal unschedule is recorded; terminal calls do not retry maintenance.
-- Storage orphan cleanup (upload succeeds, backend dies before draft creation) is
-- unverified and cannot be performed by this SQL. SQL PASS is not full Cleanup PASS;
-- cloud XLSX admission must stay closed until Storage scope/resolution is approved.
-- Inventory audit INSERT is append-only retained evidence; search_budget and all
-- unknown Inventory table mutations are denied pending separate scope approval.
