import importlib.util,json,pathlib,sys,tempfile,unittest

BASE=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE))
from engine import fingerprint,valid_reuse,release_decision,select_impacted,RunBudget,MutationJournal,redact,execute_bounded

class RegressionSafety(unittest.TestCase):
 def test_empty_gate_cannot_pass(self):self.assertEqual(release_decision([]),'NO-GO')
 def test_excessive_output_stops_run(self):
  r=execute_bounded([sys.executable,'-c','import os;os.write(1,b"x"*2097152)'],self.root,3)
  self.assertEqual(r['status'],'BLOCKED');self.assertTrue(r['output_limit_exceeded']);self.assertLessEqual(len(r['output']),6000)
 def test_password_aliases_are_redacted(self):
  out=redact('{"pw":"NewSecret123","old":"PriorSecret456"}')
  self.assertNotIn('NewSecret123',out);self.assertNotIn('PriorSecret456',out)
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
  (self.root/'src').mkdir();(self.root/'src/a.py').write_text('a=1')
  (self.root/'proof.json').write_text('{"observed":true}')
 def tearDown(self):self.tmp.cleanup()
 def record(self):
  return {'status':'PASS','inputs':fingerprint(self.root,['src/*.py']),'evidence':fingerprint(self.root,['proof.json']),'subject':'apk-A','definition':'definition-A'}
 def test_reuse_unchanged_evidence_without_running_test(self):
  self.assertTrue(valid_reuse(self.root,self.record(),['src/*.py'],'apk-A','definition-A'))
 def test_modified_evidence_is_never_reused(self):
  r=self.record();(self.root/'proof.json').write_text('{"observed":false}')
  self.assertFalse(valid_reuse(self.root,r,['src/*.py'],'apk-A','definition-A'))
 def test_new_dependency_file_invalidates_cache(self):
  r=self.record();(self.root/'src/new.py').write_text('new')
  self.assertFalse(valid_reuse(self.root,r,['src/*.py'],'apk-A','definition-A'))
 def test_new_apk_invalidates_runtime_evidence(self):
  self.assertFalse(valid_reuse(self.root,self.record(),['src/*.py'],'apk-B','definition-A'))
 def test_new_test_definition_invalidates_cache(self):
  self.assertFalse(valid_reuse(self.root,self.record(),['src/*.py'],'apk-A','definition-B'))
 def test_path_escape_is_denied(self):
  with self.assertRaises(ValueError):fingerprint(self.root,['../outside'])
 def test_missing_mandatory_is_no_go(self):
  self.assertEqual(release_decision([{'id':'login','required':True,'status':'NOT TESTED'}]),'NO-GO')
 def test_optional_not_tested_does_not_fake_a_pass_or_block(self):
  self.assertEqual(release_decision([{'id':'x','required':False,'status':'NOT TESTED'},{'id':'y','required':True,'status':'PASS'}]),'GO')
 def test_failure_overrides_success(self):
  self.assertEqual(release_decision([{'id':'x','required':True,'status':'FAIL'}]),'NO-GO')
 def test_known_change_selects_only_affected_case(self):
  c=[{'id':'auth','inputs':['auth/**']},{'id':'ota','inputs':['ota/**']}]
  self.assertEqual(select_impacted(c,['auth/token.js']),{'auth'})
 def test_unknown_change_selects_all_cases_fail_closed(self):
  c=[{'id':'auth','inputs':['auth/**']},{'id':'ota','inputs':['ota/**']}]
  self.assertEqual(select_impacted(c,['unmapped/new-client.js']),{'auth','ota'})
 def test_documentation_change_never_runs_android(self):
  c=[{'id':'auth','inputs':['auth/**']}]
  self.assertEqual(select_impacted(c,['docs/readme.md']),set())
 def test_budget_stops_after_limit(self):
  clock=[0.0];b=RunBudget(2,10,2.5,lambda:clock[0])
  b.reserve();b.completed();clock[0]=2.5;b.reserve();b.completed();clock[0]=5
  with self.assertRaises(RuntimeError):b.reserve()
 def test_spacing_measured_from_completion(self):
  clock=[0.0];b=RunBudget(5,30,2.5,lambda:clock[0]);b.reserve();clock[0]=9;b.completed();clock[0]=10
  with self.assertRaises(RuntimeError):b.reserve()
  clock[0]=11.5;b.reserve()
 def test_deadline_is_hard_stop(self):
  clock=[0.0];b=RunBudget(20,5,0,lambda:clock[0]);clock[0]=5
  with self.assertRaises(RuntimeError):b.reserve()
 def test_ambiguous_write_cannot_be_retried(self):
  j=MutationJournal(self.root/'journal.json');j.start('publish','request-digest')
  with self.assertRaises(RuntimeError):j.start('publish','request-digest')
  self.assertEqual(MutationJournal(self.root/'journal.json').status('publish'),'AMBIGUOUS')
 def test_confirmed_write_cannot_be_repeated(self):
  j=MutationJournal(self.root/'journal.json');j.start('write','digest');j.finish('write','CONFIRMED')
  with self.assertRaises(RuntimeError):j.start('write','digest')
 def test_secrets_are_redacted_from_output(self):
  out=redact('Bearer '+('a'*64)+' password=Secret123 token=xyz https://qa.test/a?token=secret')
  for needle in ['a'*64,'Secret123','xyz','token=secret']:self.assertNotIn(needle,out)
 def test_timeout_is_not_reported_as_pass(self):
  r=execute_bounded([sys.executable,'-c','import time;time.sleep(5)'],self.root,0.15)
  self.assertEqual(r['status'],'BLOCKED');self.assertTrue(r['timed_out'])
 def test_nonzero_command_is_failure(self):
  r=execute_bounded([sys.executable,'-c','raise SystemExit(3)'],self.root,3)
  self.assertEqual(r['status'],'FAIL')
 def test_no_shell_interpolation(self):
  r=execute_bounded([sys.executable,'-c','import sys;print(sys.argv[1])','literal;$(no-execution)'],self.root,3)
  self.assertEqual(r['status'],'PASS');self.assertIn('literal;$(no-execution)',r['output'])

if __name__=='__main__':unittest.main()
