import unittest,sys,pathlib,json,copy
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from single_owner_approval import verify_owner

class SingleOwnerTests(unittest.TestCase):
 def setUp(self):
  self.subject={'sourceCommit':'a'*40,'artifactSha256':'b'*64,'certificateSha256':'c'*64,'artifactId':2,'buildRunId':3}
  self.build={'id':3,'head_sha':'a'*40,'run_attempt':1,'status':'completed','conclusion':'success','repository':{'full_name':'m-as23/ICC-Reports'},'actor':{'login':'m-as23'},'completed_at':'2026-11-01T01:00:00Z'}
  self.run={**self.build,'id':4,'status':'in_progress','conclusion':None}
  self.env={'name':'maintrack-production-approval','can_admins_bypass':False,'protection_rules':[{'type':'required_reviewers','prevent_self_review':False,'reviewers':[{'type':'User','reviewer':{'login':'m-as23'}}]}]}
  self.comment={'id':5,'user':{'login':'m-as23','type':'User'},'issue_url':'https://api.github.com/repos/m-as23/ICC-Reports/issues/28','created_at':'2026-11-01T01:01:00Z','updated_at':'2026-11-01T01:01:00Z','body':json.dumps({'kind':'maintrack-owner-artifact-signoff-v1',**self.subject})}
  self.job={'run_id':4,'name':'pre-sign','status':'in_progress','conclusion':None,'started_at':'2026-11-01T01:02:00Z'}
  import hashlib
  self.reviews=[{'state':'approved','user':{'login':'m-as23','type':'User'},'environments':[{'name':'maintrack-production-approval'}],'comment':json.dumps({'kind':'maintrack-owner-environment-approval-v1','ownerCommentId':5,'bodySha256':hashlib.sha256(self.comment['body'].encode()).hexdigest()})}]
 def result(self):return verify_owner(self.build,self.run,self.env,self.reviews,self.comment,self.job,self.subject)
 def test_owner_can_approve_own_change_without_fabricated_independent_review(self):
  r=self.result();self.assertFalse(r['independentReview']);self.assertTrue(r['approved']);self.assertFalse(r['signingAuthorized']);self.assertEqual(r['ownerSignoffAt'],self.comment['created_at'])
 def test_missing_or_different_artifact_never_passes(self):
  self.subject['artifactSha256']='d'*64
  with self.assertRaises(ValueError):self.result()
 def test_nonowner_and_bot_cannot_approve(self):
  for login,kind in [('attacker','User'),('m-as23','Bot')]:
   self.comment['user']={'login':login,'type':kind}
   with self.assertRaises(ValueError):self.result()
 def test_edited_or_prebuild_signoff_rejected(self):
  self.comment['updated_at']='2026-11-01T01:03:00Z'
  with self.assertRaises(ValueError):self.result()
  self.comment['created_at']=self.comment['updated_at']='2026-11-01T00:59:00Z'
  with self.assertRaises(ValueError):self.result()
 def test_missing_environment_approval_and_admin_bypass_rejected(self):
  self.reviews=[]
  with self.assertRaises(ValueError):self.result()
  self.env['can_admins_bypass']=True
  with self.assertRaises(ValueError):self.result()
 def test_stale_source_retry_and_failed_gate_job_rejected(self):
  self.run['run_attempt']=2
  with self.assertRaises(ValueError):self.result()
  self.run['run_attempt']=1;self.job['conclusion']='failure'
  with self.assertRaises(ValueError):self.result()
 def test_duplicate_comment_fields_rejected(self):
  self.comment['body']='{"kind":"x","kind":"maintrack-owner-artifact-signoff-v1"}'
  with self.assertRaises(ValueError):self.result()
 def test_single_owner_pre_sign_preserves_gate_and_artifact_checks(self):
  from test_signing_chain import ChainTests
  from signing_chain import pre_sign
  fixture=ChainTests();fixture.setUp()
  try:
   binding={k:fixture.c[k] for k in ['sourceCommit','artifactSha256','certificateSha256','artifactId','buildRunId']}
   proof={**self.result(),**binding,'ownerSignoffAt':'2026-10-29T00:02:00Z','approvalObservedBy':'2026-10-29T00:03:00Z'}
   result=pre_sign(fixture.c,fixture.unsigned,platform=fixture.p,now=fixture.now,owner_approval=proof)
   self.assertEqual(result['status'],'PASS',result['reasons']);self.assertFalse(result['signingAuthorized'])
   self.assertEqual(result['governancePolicy'],'single-owner-v1')
   wrong={**proof,'artifactSha256':'d'*64};self.assertEqual(pre_sign(fixture.c,fixture.unsigned,platform=fixture.p,now=fixture.now,owner_approval=wrong)['status'],'BLOCKED')
   fixture.p['securityGate']['status']='FAIL';self.assertEqual(pre_sign(fixture.c,fixture.unsigned,platform=fixture.p,now=fixture.now,owner_approval=proof)['status'],'BLOCKED')
  finally:fixture.doCleanups()
 def test_release_gate_does_not_turn_single_owner_policy_into_security_acceptance(self):
  from release_gate import evaluate
  import tempfile
  with tempfile.TemporaryDirectory() as root:
   proof=self.result();r=evaluate(root,{},'a'*40,'b'*64,approval=proof)
   self.assertEqual(r['releaseDecision'],'NO-GO');self.assertNotIn('INDEPENDENT_RELEASE_APPROVAL_REQUIRED',r['reasons']);self.assertIn('MT-SEC-001:NOT_RELEASE_READY',r['reasons'])
   r=evaluate(root,{'governancePolicy':'single-owner-v1'},'a'*40,'b'*64)
   self.assertIn('VERIFIED_PLATFORM_APPROVAL_REQUIRED',r['reasons'])

if __name__=='__main__':unittest.main()
