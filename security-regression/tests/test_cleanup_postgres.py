"""Actual commits in an explicitly marked owned loopback PostgreSQL cluster.
No pg_cron emulation: scheduler registration/delivery stays separately BLOCKED.
"""
import os,pathlib,subprocess,unittest,time
ROOT=pathlib.Path(__file__).resolve().parents[2]
SQL=ROOT/'ops/maintrack/security/qa-cleanup-lease.sql'
FIXTURE=pathlib.Path(__file__).with_name('cleanup_fixture.sql')
RUN='11111111-1111-4111-8111-111111111111'
MARKER='MAINTRACK_CLEANUP_EPHEMERAL_V2'
@unittest.skipUnless(os.environ.get('MAINTRACK_CLEANUP_PG')=='1','Explicit owned PostgreSQL fixture required; never auto-connect to QA')
class CleanupPostgres(unittest.TestCase):
 def psql(self,body,ok=True,timeout=15):
  self.assertIn(os.environ.get('PGHOST'),('127.0.0.1','localhost'))
  self.assertIn(os.environ.get('PGDATABASE'),('maintrack_cleanup_ci','maintrack_cleanup_lab'))
  self.assertEqual(os.environ.get('PGUSER'),'mt_lab_admin')
  self.assertEqual(os.environ.get('MAINTRACK_CLEANUP_OWNED'),MARKER)
  p=subprocess.run([os.environ.get('MAINTRACK_PSQL','psql'),'-X','--no-password','-q','-v','ON_ERROR_STOP=1','-At'],input=body,text=True,capture_output=True,timeout=timeout)
  if ok:self.assertEqual(p.returncode,0,p.stderr)
  else:self.assertNotEqual(p.returncode,0)
  return p
 def setUp(self):
  expected_ip=os.environ.get('MAINTRACK_CLEANUP_SERVER_IP','127.0.0.1')
  import ipaddress
  ipaddress.ip_address(expected_ip)
  p=self.psql("SELECT current_user,pg_catalog.shobj_description(oid,'pg_database'),inet_server_addr()='"+expected_ip+"'::inet FROM pg_database WHERE datname=current_database();")
  self.assertEqual(p.stdout.strip(),'mt_lab_admin|'+MARKER+'|t')
  self.assertEqual(self.psql("SELECT count(*) FROM pg_extension WHERE extname='pg_cron';").stdout.strip(),'0','Never reset a fixture containing real pg_cron')
  self.psql("DROP SCHEMA IF EXISTS maintrack_qa_lease CASCADE; DROP SCHEMA IF EXISTS qa_security_final_20261025 CASCADE; DROP SCHEMA IF EXISTS qa_security_inventory_20261025 CASCADE; DROP SCHEMA IF EXISTS cron CASCADE; DROP ROLE IF EXISTS maintrack_qa_cleanup_worker;")
  self.psql(FIXTURE.read_text(encoding='utf-8-sig')+SQL.read_text(encoding='utf-8-sig'))
 def seed(self,admit='-1 second',expiry='2 minutes',state='ARMED',heartbeat=False,job='NULL'):
  return self.psql(f"INSERT INTO maintrack_qa_lease.runs(id,project_ref,started_at,admit_until,expires_at,state,baseline,heartbeat_at,job_id) VALUES('{RUN}','szhstrafzkxzstjdcynl',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '{admit}',clock_timestamp()+interval '{expiry}','{state}',maintrack_qa_lease.snapshot(),{'clock_timestamp()' if heartbeat else 'NULL'},{job});")
 def worker(self,body,ok=True):return self.psql('SET SESSION AUTHORIZATION postgres;\n'+body,ok)
 def sweep(self):return self.worker(f"CALL maintrack_qa_lease.sweep('{RUN}');")
 def runtime(self,body,ok=True):return self.psql('SET SESSION AUTHORIZATION mt_lease_test_actor;\n'+body,ok)
 def state(self):
  result=self.psql('SELECT state,verified,attempts FROM maintrack_qa_lease.runs;').stdout.strip()
  if result.startswith('FAILED'):print('Owned fixture worker SQLSTATE:',self.psql('SELECT last_error FROM maintrack_qa_lease.runs;').stdout.strip())
  return result
 def test_worker_is_non_superuser_and_can_commit_recovery(self):
  self.seed();self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
  self.assertEqual(self.psql("SELECT rolsuper FROM pg_roles WHERE rolname='postgres';").stdout.strip(),'f')
 def test_runtime_cannot_call_worker_or_assume_role(self):
  self.seed();self.runtime(f"CALL maintrack_qa_lease.sweep('{RUN}');",False)
  self.runtime('SET ROLE maintrack_qa_cleanup_worker;',False)
 def test_server_expiry_denies_new_statement(self):
  self.seed();self.assertEqual(self.psql('SELECT maintrack_qa_lease.admitting();').stdout.strip(),'f')
  self.assertIn('QA_LEASE_CLOSED',self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft');",False).stderr)
 def test_inflight_commit_after_admission_is_documented_limit(self):
  self.seed('0.5 second')
  self.runtime("BEGIN; INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft'); SELECT pg_sleep(0.7); COMMIT;")
  self.assertEqual(self.psql('SELECT count(*) FROM qa_security_inventory_20261025.versions WHERE id=3;').stdout.strip(),'1')
  self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
 def test_baseline_items_cannot_be_moved_or_mutated(self):
  self.seed('1 minute');self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft');")
  for sql in ("UPDATE qa_security_inventory_20261025.items SET version_id=3 WHERE version_id=2;","UPDATE qa_security_inventory_20261025.items SET quantity=9 WHERE version_id=2;"):
   self.assertIn('QA_BASELINE_ITEMS_IMMUTABLE',self.runtime(sql,False).stderr)
 def test_core_and_truncate_denied_even_during_admission(self):
  self.seed('1 minute')
  self.assertIn('QA_CORE_WRITES_DENIED',self.runtime("UPDATE qa_security_final_20261025.mt_reports SET body='changed';",False).stderr)
  self.assertIn('QA_TRUNCATE_DENIED',self.runtime('TRUNCATE qa_security_inventory_20261025.items;',False).stderr)
 def test_original_versions_cannot_be_deleted_or_rekeyed(self):
  self.seed('1 minute');self.runtime('DELETE FROM qa_security_inventory_20261025.versions WHERE id=1;',False)
  self.runtime("UPDATE qa_security_inventory_20261025.versions SET created_by='changed' WHERE id=2;",False)
 def test_version_budget_is_admission_limit(self):
  self.seed('1 minute');self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft'),(4,'draft');")
  self.assertIn('QA_VERSION_BUDGET_EXCEEDED',self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(5,'draft');",False).stderr)
 def test_restore_keeps_own_archive_and_is_idempotent(self):
  self.seed('1 minute');self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'current'); INSERT INTO qa_security_inventory_20261025.items VALUES(3,'QA-NEW',1); UPDATE qa_security_inventory_20261025.active SET current_version_id=3,generation=3;")
  self.psql("UPDATE maintrack_qa_lease.runs SET admit_until=clock_timestamp()-interval '1 second';")
  self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1');self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
  self.assertEqual(self.psql("SELECT status,excluded_by FROM qa_security_inventory_20261025.versions WHERE id=3;").stdout.strip(),'archived|QA_LEASE_CLEANUP')
  self.assertEqual(self.psql('SELECT current_version_id FROM qa_security_inventory_20261025.active;').stdout.strip(),'2')
 def test_corruption_never_claims_success_and_stops_at_two(self):
  self.seed();self.psql('ALTER TABLE qa_security_inventory_20261025.items DISABLE TRIGGER USER; UPDATE qa_security_inventory_20261025.items SET quantity=999 WHERE version_id=2; ALTER TABLE qa_security_inventory_20261025.items ENABLE TRIGGER USER;')
  self.sweep();self.sweep();self.sweep();self.assertEqual(self.state(),'FAILED|f|2')
 def test_query_canceled_does_not_erase_attempt_or_session_expiry(self):
  self.seed();self.psql("CREATE FUNCTION maintrack_qa_lease.inject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected cancellation' USING ERRCODE='57014'; END$$; CREATE TRIGGER injected_cancel BEFORE UPDATE ON qa_security_inventory_20261025.versions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.inject_cancel();")
  self.sweep();self.assertEqual(self.state(),'FAILED|f|1');self.sweep();self.sweep();self.assertEqual(self.state(),'FAILED|f|2')
  self.assertEqual(self.psql('SELECT last_error FROM maintrack_qa_lease.runs;').stdout.strip(),'57014')
 def test_scheduler_maintenance_failure_cannot_undo_cleanup(self):
  self.seed(job='42');self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
  self.assertEqual(self.psql("SELECT count(*) FROM maintrack_qa_lease.events WHERE kind='SCHEDULER_MAINTENANCE_FAILED';").stdout.strip(),'1')
 def test_own_job_is_disabled_after_cleanup_and_after_recovered_worker_crash(self):
  # Metadata-table fixture only; this does not emulate/claim real Cron delivery.
  self.psql("CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,username text,database text,active boolean); INSERT INTO cron.job VALUES(42,'mtqa_"+RUN+"','postgres',current_database(),true);")
  self.seed(job='42');self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
  self.assertEqual(self.psql('SELECT active FROM cron.job WHERE jobid=42;').stdout.strip(),'f')
  self.psql('UPDATE cron.job SET active=true WHERE jobid=42;')
  self.sweep();self.assertEqual(self.psql('SELECT active FROM cron.job WHERE jobid=42;').stdout.strip(),'f')
 def test_job_ownership_mismatch_never_stops_another_job(self):
  self.psql("CREATE SCHEMA cron; CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,username text,database text,active boolean); INSERT INTO cron.job VALUES(42,'unrelated','other',current_database(),true);")
  self.seed(job='42');self.sweep();self.assertEqual(self.state(),'COMPLETE|t|1')
  self.assertEqual(self.psql('SELECT active FROM cron.job WHERE jobid=42;').stdout.strip(),'t')
  self.assertEqual(self.psql("SELECT count(*) FROM maintrack_qa_lease.events WHERE kind='SCHEDULER_MAINTENANCE_FAILED';").stdout.strip(),'1')
 def test_late_completion_stays_late(self):
  self.seed('-2 seconds','-1 second');self.sweep();self.assertEqual(self.psql('SELECT verified,late FROM maintrack_qa_lease.runs;').stdout.strip(),'t|t')
 def test_expiry_alone_is_not_cleanup(self):
  self.seed();self.assertEqual(self.psql('SELECT maintrack_qa_lease.admitting(),verified FROM maintrack_qa_lease.runs;').stdout.strip(),'f|f')
 def test_no_heartbeat_no_arm_then_worker_handshake_allows_arm(self):
  self.seed('1 minute','5 minutes','PREPARED')
  arm=f"SELECT maintrack_qa_lease.arm('{RUN}',repeat('a',64),repeat('b',64),'[{{\"code\":\"90000001\",\"tokenHash\":\"{'c'*64}\"}}]');"
  self.assertIn('WORKER_HEARTBEAT_OR_BASELINE_INVALID',self.worker(arm,False).stderr)
  self.sweep();self.worker(arm)
  self.assertEqual(self.psql('SELECT s.expires_at=r.admit_until FROM qa_security_final_20261025.mt_sessions s CROSS JOIN maintrack_qa_lease.runs r;').stdout.strip(),'t')
 def test_prepare_rejects_wrong_project_and_missing_scheduler(self):
  self.assertIn('QA_BINDING_OR_BASELINE_INVALID',self.worker(f"SELECT maintrack_qa_lease.prepare('{RUN}','wrong');",False).stderr)
  self.assertIn('SERVER_SCHEDULER_UNAVAILABLE',self.worker(f"SELECT maintrack_qa_lease.prepare('{RUN}','szhstrafzkxzstjdcynl');",False).stderr)
 def test_actual_statement_timeout_keeps_durable_attempt(self):
  self.seed();self.psql("CREATE FUNCTION maintrack_qa_lease.inject_sleep() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(2); RETURN NULL; END$$; CREATE TRIGGER injected_sleep BEFORE UPDATE ON qa_security_inventory_20261025.versions FOR EACH STATEMENT EXECUTE FUNCTION maintrack_qa_lease.inject_sleep();")
  self.worker(f"SET statement_timeout='200ms'; CALL maintrack_qa_lease.sweep('{RUN}');")
  self.assertEqual(self.state(),'FAILED|f|1')
  self.assertEqual(self.psql('SELECT last_error FROM maintrack_qa_lease.runs;').stdout.strip(),'57014')
 def test_inflight_writer_prevents_false_verified_cleanup(self):
  self.seed('1 second');self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft'); INSERT INTO qa_security_inventory_20261025.items VALUES(3,'QA-NEW',1);")
  env=dict(os.environ,PGAPPNAME='maintrack_cleanup_owned_writer')
  proc=subprocess.Popen([os.environ.get('MAINTRACK_PSQL','psql'),'-X','--no-password','-q','-v','ON_ERROR_STOP=1','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  proc.stdin.write("SET SESSION AUTHORIZATION mt_lease_test_actor; BEGIN; UPDATE qa_security_inventory_20261025.items SET quantity=2 WHERE version_id=3; SELECT pg_sleep(4); COMMIT;")
  proc.stdin.close();proc.stdin=None
  try:
   seen=False
   for _ in range(30):
    if self.psql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name='maintrack_cleanup_owned_writer' AND l.mode='RowExclusiveLock' AND l.granted);").stdout.strip()=='t':seen=True;break
    time.sleep(0.05)
   self.assertTrue(seen,'writer never acquired its table lock')
   time.sleep(1.1);self.sweep();self.assertEqual(self.state(),'FAILED|f|1')
   self.assertEqual(self.psql('SELECT last_error FROM maintrack_qa_lease.runs;').stdout.strip(),'55P03')
   out,err=proc.communicate(timeout=8);self.assertEqual(proc.returncode,0,err)
   self.sweep();self.assertEqual(self.state(),'COMPLETE|t|2')
  finally:
   if proc.poll() is None:proc.kill();proc.communicate()
 def test_budget_reservation_only_during_admission(self):
  self.seed('1 minute');self.psql("UPDATE qa_security_final_20261025.qa_control SET active_tests_authorized=true,approved_plan_sha256=repeat('a',64),approved_until=clock_timestamp()+interval '1 minute',request_count=0,max_requests=60,min_spacing_ms=2600;")
  reserve="UPDATE qa_security_final_20261025.qa_control SET request_count=request_count+1,last_request_at=clock_timestamp() WHERE singleton;"
  self.runtime(reserve)
  self.assertEqual(self.psql('SELECT request_count FROM qa_security_final_20261025.qa_control;').stdout.strip(),'1')
  self.assertIn('QA_CONTROL_RESERVATION_ONLY',self.runtime(reserve,False).stderr)
  self.assertIn('QA_CONTROL_RESERVATION_ONLY',self.runtime('UPDATE qa_security_final_20261025.qa_control SET max_requests=1000;',False).stderr)
  self.psql("UPDATE maintrack_qa_lease.runs SET admit_until=clock_timestamp()-interval '1 second';")
  self.assertIn('QA_LEASE_CLOSED',self.runtime(reserve,False).stderr)
 def test_own_draft_can_be_sealed_baseline_cannot(self):
  self.seed('1 minute');self.runtime("INSERT INTO qa_security_inventory_20261025.versions(id,status) VALUES(3,'draft'); INSERT INTO qa_security_inventory_20261025.items VALUES(3,'QA-NEW',1); UPDATE qa_security_inventory_20261025.versions SET sealed=true,item_count=1 WHERE id=3;")
  self.assertEqual(self.psql('SELECT sealed,item_count FROM qa_security_inventory_20261025.versions WHERE id=3;').stdout.strip(),'t|1')
  self.assertIn('QA_VERSION_SOURCE_IMMUTABLE',self.runtime('UPDATE qa_security_inventory_20261025.versions SET sealed=true,item_count=9 WHERE id=2;',False).stderr)
 def test_audit_append_only_unknown_and_search_budget_denied(self):
  self.seed('1 minute');self.runtime("INSERT INTO qa_security_inventory_20261025.audit VALUES(2,'retained run evidence');")
  for sql in ("UPDATE qa_security_inventory_20261025.audit SET detail='changed';","DELETE FROM qa_security_inventory_20261025.audit;","UPDATE qa_security_inventory_20261025.search_budget SET requests=2;","INSERT INTO qa_security_inventory_20261025.unscoped_fixture VALUES(1);"):
   self.assertIn('QA_INVENTORY_TABLE_NOT_SCOPED',self.runtime(sql,False).stderr)
  self.assertEqual(self.psql("SELECT detail FROM qa_security_inventory_20261025.audit WHERE id=1;").stdout.strip(),'baseline evidence')
if __name__=='__main__':unittest.main()



