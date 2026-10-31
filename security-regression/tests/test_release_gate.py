import copy,hashlib,json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from release_gate import REQUIRED,evaluate,source_dirty
from unittest.mock import patch
class GateTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name);(self.root/'proof.json').write_text('{"synthetic":true}')
  self.commit='a'*40;self.apk='b'*64;ev={'path':'proof.json','sha256':hashlib.sha256((self.root/'proof.json').read_bytes()).hexdigest()}
  self.record={'schema':1,'sourceCommit':self.commit,'artifactSha256':self.apk,'productionSourceProven':True,'independentApproval':True,'findings':[],'cases':{x:{'status':'PASS','sourceCommit':self.commit,'artifactSha256':self.apk,'evidence':[ev.copy()]} for x in REQUIRED}}
  self.cleanup={'kind':'maintrack-server-cleanup-v1','projectRef':'szhstrafzkxzstjdcynl','sourceCommit':self.commit,'artifactSha256':self.apk,'serverClock':True,'admissionClosed':True,'sessionsInactive':True,'baselineVerified':True,'archivesRetained':True,'serverSchedulerProven':True,'controllerFailureExercised':True,'storageObjectsReconciled':True,'schedulerStopped':True,'serverTimeoutProven':True,'startedAt':'2026-10-28T03:00:00Z','admitUntil':'2026-10-28T03:03:00Z','deadline':'2026-10-28T03:07:00Z','verifiedAt':'2026-10-28T03:04:00Z'}
  self.bind_cleanup(self.cleanup)
  self.approval={'kind':'github-environment-review-v1','repository':'m-as23/ICC-Reports','environment':'maintrack-production-approval','reviewer':'m-as23','runId':12,'sourceCommit':self.commit,'artifactSha256':self.apk,'approved':True}
  client=b'synthetic overlaid client';self.native_hash=hashlib.sha256(client).hexdigest();(self.root/'client.js').write_bytes(client)
  headers=[{'source':s,'headers':[{'key':'Content-Security-Policy','value':"default-src 'self'; frame-ancestors 'self'"},{'key':'X-Frame-Options','value':'SAMEORIGIN'}]} for s in ('/','/index.html','/index','/inventory-reference.html','/inventory-reference','/qa-security.html','/qa-security','/security-final-check.html','/security-final-check')]
  provenance={'schema':1,'sourceCommit':self.commit,'canonicalLocksModified':False,'changes':[{'path':p,'before':'d'*64,'after':self.native_hash,'origin':'PR27'} for p in ('web/secure-assets/index-inline-1.js','native/www/secure-assets/index-inline-1.js')],'headerPolicy':headers}
  (self.root/'provenance.json').write_text(json.dumps(provenance));(self.root/'headers.json').write_text(json.dumps({'headers':headers}))
  entry=lambda p:{'path':p,'sha256':hashlib.sha256((self.root/p).read_bytes()).hexdigest()}
  self.record['candidateBuild']={'provenance':entry('provenance.json'),'webClient':entry('client.js'),'webHeaders':entry('headers.json')}
  self.record['findingReadiness']={f'MT-SEC-{i:03d}':'PASS' for i in range(1,6)}
 def bind_cleanup(self,proof):
  data=json.dumps(proof).encode();(self.root/'cleanup.json').write_bytes(data)
  self.record['cases']['qa-cleanup']['evidence']=[{'path':'cleanup.json','sha256':hashlib.sha256(data).hexdigest()}]
 def result(self,r=None):return evaluate(self.root,self.record if r is None else r,self.commit,self.apk,approval=self.approval,native_client_sha256=self.native_hash)['releaseDecision']
 def test_record_cannot_self_assert_platform_approval(self):
  r=evaluate(self.root,self.record,self.commit,self.apk,native_client_sha256=self.native_hash)
  self.assertEqual(r['releaseDecision'],'NO-GO');self.assertIn('VERIFIED_PLATFORM_APPROVAL_REQUIRED',r['reasons'])
 def test_platform_approval_must_bind_current_source_and_artifact(self):
  for key,value in [('sourceCommit','c'*40),('artifactSha256','c'*64),('reviewer','other'),('approved',False),('environment','other')]:
   proof=dict(self.approval);proof[key]=value
   self.assertEqual(evaluate(self.root,self.record,self.commit,self.apk,approval=proof,native_client_sha256=self.native_hash)['releaseDecision'],'NO-GO')
 def test_unresolved_known_findings_block_even_when_cases_claim_pass(self):
  for status in ('PARTIAL','BLOCKED','NOT TESTED','CLOSED LOCALLY','FAIL'):
   r=copy.deepcopy(self.record);r['findingReadiness']['MT-SEC-001']=status;self.assertEqual(self.result(r),'NO-GO')
 def test_raw_canonical_or_unbound_build_cannot_pass(self):
  r=copy.deepcopy(self.record);r.pop('candidateBuild');self.assertEqual(self.result(r),'NO-GO')
  self.assertEqual(evaluate(self.root,self.record,self.commit,self.apk,approval=self.approval,native_client_sha256='f'*64)['releaseDecision'],'NO-GO')
 def test_complete_synthetic_fixture_can_pass_without_authorizing_deploy(self):
  self.assertEqual(self.result(),'GO');self.assertFalse(evaluate(self.root,self.record,self.commit,self.apk)['deploymentAuthorized'])
 def test_missing_each_mandatory_case_blocks(self):
  for key in REQUIRED:
   r=copy.deepcopy(self.record);del r['cases'][key];self.assertEqual(self.result(r),'NO-GO',key)
 def test_fail_not_tested_blocked_never_pass(self):
  for status in ['FAIL','NOT TESTED','BLOCKED','REUSED','',None]:
   r=copy.deepcopy(self.record);r['cases'][REQUIRED[0]]['status']=status;self.assertEqual(self.result(r),'NO-GO')
 def test_stale_source_or_apk_blocks(self):
  for key,value in [('sourceCommit','c'*40),('artifactSha256','c'*64)]:
   r=copy.deepcopy(self.record);r[key]=value;self.assertEqual(self.result(r),'NO-GO')
 def test_stale_case_binding_blocks(self):
  for key in ['sourceCommit','artifactSha256']:
   r=copy.deepcopy(self.record);r['cases'][REQUIRED[0]][key]='old';self.assertEqual(self.result(r),'NO-GO')
 def test_unproven_production_and_no_approval_block(self):
  for key in ['productionSourceProven','independentApproval']:
   r=copy.deepcopy(self.record);r[key]=False;self.assertEqual(self.result(r),'NO-GO')
 def test_unresolved_high_critical_block(self):
  for severity in ['High','Critical','HIGH','critical',' high ']:
   r=copy.deepcopy(self.record);r['findings']=[{'severity':severity,'resolved':False}];self.assertEqual(self.result(r),'NO-GO')
 def test_absent_findings_review_blocks(self):
  del self.record['findings'];self.assertEqual(self.result(),'NO-GO')
 def test_missing_changed_and_outside_evidence_block(self):
  for evidence in [[],[{'path':'absent','sha256':'c'*64}],[{'path':'proof.json','sha256':'c'*64}],[{'path':'../outside','sha256':'c'*64}]]:
   r=copy.deepcopy(self.record);r['cases'][REQUIRED[0]]['evidence']=evidence;self.assertEqual(self.result(r),'NO-GO')
 def test_empty_local_ci_report_never_authorizes_release(self):self.assertEqual(self.result({'localCheck':'PASS'}),'NO-GO')
 def test_missing_unknown_and_malformed_severity_block(self):
  for finding in [{},{'severity':'UNKNOWN'},{'severity':None},{'severity':7},'invalid']:
   r=copy.deepcopy(self.record);r['findings']=[finding];self.assertEqual(self.result(r),'NO-GO')
 def test_untracked_source_is_dirty_but_ignored_outputs_are_not(self):
  def git_status(argv,**kwargs):return '?? ops/maintrack/scripts/new-overlay.mjs\n' if '--untracked-files=all' in argv else ''
  with patch('release_gate.subprocess.check_output',side_effect=git_status):self.assertTrue(source_dirty(self.root))
  with patch('release_gate.subprocess.check_output',return_value=''):self.assertFalse(source_dirty(self.root))
 def test_expired_channel_is_not_verified_cleanup(self):
  self.bind_cleanup({'admissionClosed':True})
  self.assertEqual(self.result(),'NO-GO')
 def test_each_missing_server_cleanup_guarantee_blocks(self):
  for key in ('serverClock','admissionClosed','sessionsInactive','baselineVerified','archivesRetained','serverSchedulerProven','controllerFailureExercised','storageObjectsReconciled','schedulerStopped','serverTimeoutProven'):
   p=copy.deepcopy(self.cleanup);p[key]=False;self.bind_cleanup(p);self.assertEqual(self.result(),'NO-GO',key)
 def test_cleanup_invalid_times_project_and_binding_block(self):
  for key,value in [('startedAt','bad'),('admitUntil','2026-10-28T04:00:00Z'),('deadline','2026-10-28T06:00:00Z'),('verifiedAt','2026-10-28T03:04:00'),('projectRef','other'),('sourceCommit','c'*40),('artifactSha256','c'*64)]:
   p=copy.deepcopy(self.cleanup);p[key]=value;self.bind_cleanup(p);self.assertEqual(self.result(),'NO-GO',key)
 def test_cleanup_deadline_overrun_cannot_pass_even_with_verified_baseline(self):
  r=self.record
  proof={'kind':'maintrack-server-cleanup-v1','projectRef':'szhstrafzkxzstjdcynl','serverClock':True,'admissionClosed':True,'sessionsInactive':True,'baselineVerified':True,'archivesRetained':True,'serverSchedulerProven':True,'controllerFailureExercised':True,'deadline':'2026-10-28T03:27:35Z','verifiedAt':'2026-10-28T05:37:46Z'}
  (self.root/'cleanup.json').write_text(__import__('json').dumps(proof));r['cases']['qa-cleanup']['evidence']=[{'path':'cleanup.json','sha256':hashlib.sha256((self.root/'cleanup.json').read_bytes()).hexdigest()}]
  self.assertEqual(self.result(),'NO-GO')
if __name__=='__main__':unittest.main()
