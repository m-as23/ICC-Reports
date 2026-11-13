import copy,datetime,hashlib,pathlib,struct,sys,tempfile,unittest,zipfile
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from signing_chain import pre_sign,post_sign
from release_gate import REQUIRED
class ChainTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name);self.unsigned=self.root/'unsigned.apk';self.signed=self.root/'signed.apk'
  self.apk(self.unsigned);self.apk(self.signed,signature=True)
  digest=hashlib.sha256(self.unsigned.read_bytes()).hexdigest();self.now=datetime.datetime(2026,10,29,0,5,tzinfo=datetime.timezone.utc)
  self.c={'repository':'m-as23/ICC-Reports','sourceCommit':'a'*40,'artifactId':11,'buildRunId':22,'artifactSha256':digest,'certificateSha256':'c'*64,'workflowPath':'.github/workflows/security-release.yml','prAuthor':'author'}
  common={'sourceCommit':'a'*40,'artifactId':11,'artifactSha256':digest}
  self.p={'repository':'m-as23/ICC-Reports','build':{**common,'runId':22,'conclusion':'success','attempt':1,'workflowPath':self.c['workflowPath'],'actor':'builder','completedAt':'2026-10-29T00:01:00Z'},'review':{**common,'prAuthor':'author','latestPusher':'last-pusher','lastPushApprovalEnforced':True,'state':'APPROVED','authorized':True,'reviewer':'independent-reviewer','certificateSha256':'c'*64,'submittedAt':'2026-10-29T00:02:00Z'},'approval':{**common,'state':'approved','reviewer':'m-as23','actor':'builder','authorized':True,'preventSelfReview':True,'adminBypass':False,'environment':'maintrack-production-approval','buildRunId':22,'certificateSha256':'c'*64,'approvedAt':'2026-10-29T00:03:00Z'},'securityGate':{**common,'status':'PASS','cases':{x:'PASS' for x in REQUIRED}}}
 def apk(self,p,signature=False,client=b'original-client'):
  with zipfile.ZipFile(p,'w') as z:
   z.writestr('AndroidManifest.xml',b'synthetic-manifest');z.writestr('classes.dex',client)
   if signature:z.writestr('META-INF/CERT.SF',b'synthetic-signature-metadata')
 def result(self,c=None,p=None):return pre_sign(c or self.c,self.unsigned,platform=self.p if p is None else p,now=self.now)
 def test_unsigned_candidate_can_pass_contract_without_signature_or_authorization(self):
  r=self.result();self.assertEqual(r['status'],'PASS');self.assertFalse(r['signingAuthorized']);self.assertFalse(r['deploymentAuthorized'])
 def test_candidate_self_assertion_is_not_platform_approval(self):
  c={**self.c,'independentApproval':True,'review':self.p['review'],'approval':self.p['approval']};self.assertEqual(self.result(c,{})['status'],'BLOCKED')
 def test_source_run_artifact_changes_block(self):
  for section,key,value in [('build','sourceCommit','b'*40),('build','runId',23),('build','attempt',2),('review','artifactSha256','b'*64),('approval','artifactId',12)]:
   p=copy.deepcopy(self.p);p[section][key]=value;self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_review_and_approval_must_be_independent_ordered_and_real(self):
  for section,key,value in [('review','reviewer','author'),('review','authorized',False),('approval','actor','m-as23'),('approval','approvedAt','2026-10-29T00:01:01Z'),('approval','adminBypass',True),('approval','preventSelfReview',False)]:
   p=copy.deepcopy(self.p);p[section][key]=value;self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_missing_approval_time_cannot_be_inferred(self):
  p=copy.deepcopy(self.p);del p['approval']['approvedAt'];self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_fail_blocked_not_tested_required_case_blocks(self):
  for status in ['FAIL','BLOCKED','NOT TESTED',None]:
   p=copy.deepcopy(self.p);p['securityGate']['cases'][REQUIRED[0]]=status;self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_reviewed_cert_mismatch_blocks(self):
  p=copy.deepcopy(self.p);p['review']['certificateSha256']='d'*64;self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_unsigned_artifact_change_and_already_signed_input_block(self):
  self.apk(self.unsigned,client=b'substituted');self.assertEqual(self.result()['status'],'BLOCKED');self.apk(self.unsigned,signature=True);self.assertEqual(self.result()['status'],'BLOCKED')
 def receipt(self,r):return {'kind':'trusted-signing-job-v1','sourceCommit':r['sourceCommit'],'unsignedSha256':r['unsignedSha256'],'signedSha256':hashlib.sha256(self.signed.read_bytes()).hexdigest(),'certificateSha256':r['certificateSha256'],'buildRunId':r['buildRunId'],'signingRunId':33,'signedAt':'2026-10-29T00:04:00Z'}
 def test_modern_signing_block_cannot_qualify_as_unsigned(self):
  raw=self.unsigned.read_bytes();end=raw.rfind(b'PK\x05\x06');offset=struct.unpack_from('<I',raw,end+16)[0]
  block=struct.pack('<Q',24)+struct.pack('<Q',24)+b'APK Sig Block 42'
  changed=bytearray(raw[:offset]+block+raw[offset:]);struct.pack_into('<I',changed,end+len(block)+16,offset+len(block));self.unsigned.write_bytes(changed)
  digest=hashlib.sha256(changed).hexdigest();c={**self.c,'artifactSha256':digest};p=copy.deepcopy(self.p)
  for section in ['build','review','approval','securityGate']:p[section]['artifactSha256']=digest
  self.assertEqual(self.result(c,p)['status'],'BLOCKED')
 def test_post_sign_preserves_payload_and_requires_real_verifier_success(self):
  r=self.result()
  with patch('signing_chain.verify_certificate',return_value='c'*64) as verify:
   out=post_sign(r,self.unsigned,self.signed,apksigner='fixture-verifier',signing=self.receipt(r));self.assertEqual(out['status'],'PASS');self.assertFalse(out['deploymentAuthorized']);verify.assert_called_once()
 def test_post_sign_detects_substituted_payload_and_unsigned_input(self):
  r=self.result();self.apk(self.signed,signature=True,client=b'changed')
  with patch('signing_chain.verify_certificate',return_value='c'*64):self.assertEqual(post_sign(r,self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
  self.apk(self.unsigned,client=b'changed-input')
  with patch('signing_chain.verify_certificate',return_value='c'*64):self.assertEqual(post_sign(r,self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
 def test_missing_pre_sign_or_failed_signature_never_passes(self):
  with patch('signing_chain.verify_certificate',side_effect=ValueError('bad cert')):self.assertEqual(post_sign(self.result(),self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
  self.assertEqual(post_sign({},self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
 def test_malformed_proof_and_workflow_paths_fail_closed(self):
  self.assertEqual(pre_sign(None,self.unsigned,now=self.now)['status'],'BLOCKED')
  self.assertEqual(post_sign(None,self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
  c={**self.c,'workflowPath':'.github/workflows/../../unsafe.yml'};self.assertEqual(self.result(c)['status'],'BLOCKED')
 def test_signing_before_approval_or_missing_receipt_blocks(self):
  r=self.result();receipt=self.receipt(r);receipt['signedAt']='2026-10-29T00:01:00Z'
  with patch('signing_chain.verify_certificate',return_value='c'*64):
   self.assertEqual(post_sign(r,self.unsigned,self.signed,apksigner='fixture',signing=receipt)['status'],'BLOCKED')
   self.assertEqual(post_sign(r,self.unsigned,self.signed,apksigner='fixture')['status'],'BLOCKED')
 def test_trusted_review_cannot_approve_its_own_author_or_latest_push(self):
  for key in ('prAuthor','latestPusher'):
   p=copy.deepcopy(self.p);p['review'][key]=p['review']['reviewer'];self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_candidate_author_field_cannot_substitute_for_trusted_identity(self):
  p=copy.deepcopy(self.p);p['review'].pop('prAuthor',None)
  self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_missing_last_push_platform_enforcement_blocks(self):
  p=copy.deepcopy(self.p);p['review']['lastPushApprovalEnforced']=False
  self.assertEqual(self.result(p=p)['status'],'BLOCKED')
 def test_known_debug_certificate_is_rejected_before_signing(self):
  debug='aae0b7fe57ae5e65749c8967861918b7bb9a6ff9275ee980c96b88d4a01ca5fe'
  c={**self.c,'certificateSha256':debug};p=copy.deepcopy(self.p)
  for section in ('review','approval'):p[section]['certificateSha256']=debug
  result=self.result(c,p)
  self.assertEqual(result['status'],'BLOCKED')
  self.assertIn('QA_DEBUG_CERTIFICATE_NOT_RELEASE',result['reasons'])
if __name__=='__main__':unittest.main()
