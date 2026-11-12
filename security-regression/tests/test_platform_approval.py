import unittest,sys,pathlib,copy,tempfile,zipfile,hashlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from platform_approval import verify,native_client_hash,verify_artifact,verify_certificate
class PlatformTests(unittest.TestCase):
 def setUp(self):
  self.run={'repository':{'full_name':'m-as23/ICC-Reports'},'head_sha':'a'*40,'id':1,'run_attempt':1,'actor':{'login':'independent-builder'},'triggering_actor':{'login':'independent-builder'}}
  self.env={'name':'maintrack-production-approval','can_admins_bypass':False,'protection_rules':[{'type':'required_reviewers','prevent_self_review':True,'reviewers':[{'type':'User','reviewer':{'login':'m-as23'}}]}]}
  self.reviews=[{'state':'approved','user':{'login':'m-as23'},'environments':[{'name':'maintrack-production-approval'}]}]
 def test_actual_platform_contract_accepts_bound_independent_owner(self):
  self.assertTrue(verify(self.run,self.env,self.reviews,'a'*40,'b'*64)['approved'])
 def test_missing_self_wrong_source_retry_and_unprotected_reject(self):
  for key,value in [('head_sha','c'*40),('actor',{'login':'m-as23'}),('run_attempt',2)]:
   run=copy.deepcopy(self.run);run[key]=value
   with self.assertRaises(ValueError):verify(run,self.env,self.reviews,'a'*40,'b'*64)
  for env,reviews in [(self.env,[]),({**self.env,'can_admins_bypass':True},self.reviews),({**self.env,'protection_rules':[]},self.reviews)]:
   with self.assertRaises(ValueError):verify(self.run,env,reviews,'a'*40,'b'*64)
 def test_native_hash_is_from_actual_apk_entry(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'candidate.apk'
   with zipfile.ZipFile(p,'w') as z:z.writestr('assets/public/secure-assets/index-inline-1.js',b'overlaid-client')
   self.assertEqual(native_client_hash(p),hashlib.sha256(b'overlaid-client').hexdigest())
class ArtifactTests(unittest.TestCase):
 def test_run_commit_archive_and_actual_apk_are_all_bound(self):
  import io
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr('apk/candidate.apk',b'actual-apk')
  archive=b.getvalue();digest=hashlib.sha256(b'actual-apk').hexdigest();meta={'expired':False,'workflow_run':{'id':12,'head_sha':'a'*40},'digest':'sha256:'+hashlib.sha256(archive).hexdigest()}
  self.assertTrue(verify_artifact(meta,archive,12,'a'*40,digest,'candidate.apk'))
  for run,commit,apk in [(13,'a'*40,digest),(12,'c'*40,digest),(12,'a'*40,'d'*64)]:
   with self.assertRaises(ValueError):verify_artifact(meta,archive,run,commit,apk,'candidate.apk')
  with self.assertRaises(ValueError):verify_artifact({**meta,'expired':True},archive,12,'a'*40,digest,'candidate.apk')
class CertificateTests(unittest.TestCase):
 def test_real_verifier_output_must_match_reviewed_fingerprint(self):
  from unittest.mock import patch
  with patch('platform_approval.subprocess.check_output',return_value='Signer #1 certificate SHA-256 digest: '+'a'*64+'\n'):
   self.assertEqual(verify_certificate('apksigner','candidate.apk','a'*64),'a'*64)
   with self.assertRaises(ValueError):verify_certificate('apksigner','candidate.apk','b'*64)
  with self.assertRaises(ValueError):verify_certificate('apksigner','candidate.apk',None)
class BoundReviewTests(unittest.TestCase):
 def setUp(self):
  import json
  self.subject={'sourceCommit':'a'*40,'artifactSha256':'b'*64,'certificateSha256':'c'*64,'artifactId':2,'buildRunId':3,'buildActor':'builder'}
  self.pr={'number':28,'state':'open','draft':False,'user':{'login':'author'},'head':{'sha':'a'*40,'repo':{'full_name':'m-as23/ICC-Reports'}},'base':{'repo':{'full_name':'m-as23/ICC-Reports'}}}
  self.review={'id':4,'state':'APPROVED','user':{'login':'reviewer','type':'User'},'commit_id':'a'*40,'submitted_at':'2026-11-01T02:00:00Z','body':json.dumps({'kind':'maintrack-artifact-review-v1',**{k:v for k,v in self.subject.items() if k!='buildActor'}})}
  self.permissions={'reviewer':{'permission':'write','user':{'login':'reviewer'}}}
 def result(self,reviews=None,subject=None,pr=None):
  from platform_approval import verify_pr_artifact_review
  return verify_pr_artifact_review(pr or self.pr,[self.review] if reviews is None else reviews,self.permissions,subject or self.subject,'2026-11-01T01:00:00Z')
 def test_bound_review_is_only_partial_without_verified_latest_push(self):
  x=self.result();self.assertEqual(x['reviewer'],'reviewer');self.assertEqual(x['prAuthor'],'author');self.assertIsNone(x['latestPusher']);self.assertFalse(x['signingAuthorized']);self.assertFalse(x['lastPushApprovalEnforced'])
 def test_source_artifact_certificate_run_and_permission_are_bound(self):
  for k,v in [('sourceCommit','d'*40),('artifactSha256','d'*64),('certificateSha256','d'*64),('buildRunId',9),('artifactId',9)]:
   with self.subTest(field=k),self.assertRaises(ValueError):self.result(subject={**self.subject,k:v})
  self.permissions['reviewer']['permission']='read'
  with self.assertRaises(ValueError):self.result()
 def test_author_builder_bot_draft_and_comment_cannot_approve(self):
  for change in [{'user':{'login':'author','type':'User'}},{'user':{'login':'builder','type':'User'}},{'user':{'login':'reviewer','type':'Bot'}},{'state':'COMMENTED'}]:
   with self.subTest(change=change),self.assertRaises(ValueError):self.result(reviews=[{**self.review,**change}])
  with self.assertRaises(ValueError):self.result(pr={**self.pr,'draft':True})
 def test_review_after_build_and_latest_vote_are_required(self):
  with self.assertRaises(ValueError):self.result(reviews=[{**self.review,'submitted_at':'2026-11-01T00:00:00Z'}])
  for state in ['CHANGES_REQUESTED','DISMISSED']:
   with self.subTest(state=state),self.assertRaises(ValueError):self.result(reviews=[self.review,{**self.review,'id':5,'state':state,'submitted_at':'2026-11-01T03:00:00Z'}])
 def test_ambiguous_json_and_unbounded_review_pages_fail_closed(self):
  with self.assertRaises(ValueError):self.result(reviews=[{**self.review,'body':'{"kind":"maintrack-artifact-review-v1","kind":"duplicate"}'}])
  with self.assertRaises(ValueError):self.result(reviews=[self.review]*100)
class DebugCertificateTests(unittest.TestCase):
 def test_known_qa_fingerprint_and_android_debug_dn_are_not_release_identity(self):
  from unittest.mock import patch
  with patch('platform_approval.subprocess.check_output') as call:
   with self.assertRaises(ValueError):verify_certificate('apksigner','candidate.apk','aae0b7fe57ae5e65749c8967861918b7bb9a6ff9275ee980c96b88d4a01ca5fe')
   call.assert_not_called()
  with patch('platform_approval.subprocess.check_output',return_value='Signer #1 certificate DN: CN=Android Debug, O=Android, C=US\nSigner #1 certificate SHA-256 digest: '+'a'*64+'\n'):
   with self.assertRaises(ValueError):verify_certificate('apksigner','candidate.apk','a'*64)

class CollectorTests(unittest.TestCase):
 setUp=BoundReviewTests.setUp
 def test_missing_trusted_workflow_pin_is_rejected_before_platform_access(self):
  from unittest.mock import patch
  from platform_approval import fetch_pr_artifact_review
  with patch('platform_approval.api') as api:
   with self.assertRaisesRegex(ValueError,'TRUSTED_WORKFLOW_PIN_REQUIRED'):fetch_pr_artifact_review(28,3,2,'a'*40,'b'*64,'candidate.apk','c'*64,expected_workflow_path=None,expected_workflow_sha256=None)
   api.assert_not_called()
 def test_draft_stops_before_artifact_download(self):
  from unittest.mock import patch
  from platform_approval import fetch_pr_artifact_review
  with patch('platform_approval.api',return_value={**self.pr,'draft':True}) as api,patch('platform_approval.subprocess.check_output') as download:
   with self.assertRaises(ValueError):fetch_pr_artifact_review(28,3,2,'a'*40,'b'*64,'candidate.apk','c'*64,expected_workflow_path='.github/workflows/fixture.yml',expected_workflow_sha256=hashlib.sha256(b'fixture-workflow').hexdigest())
   self.assertEqual(api.call_count,1);download.assert_not_called()
 def test_collector_binds_real_archive_and_api_permissions(self):
  import io
  from unittest.mock import patch
  from platform_approval import fetch_pr_artifact_review
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr('candidate.apk',b'unsigned-fixture')
  archive=b.getvalue();digest=hashlib.sha256(b'unsigned-fixture').hexdigest()
  import json
  review={**self.review,'body':json.dumps({'kind':'maintrack-artifact-review-v1',**{k:(digest if k=='artifactSha256' else v) for k,v in self.subject.items() if k!='buildActor'}})}
  replies={'pulls/28':self.pr,'actions/runs/3':{'head_sha':'a'*40,'repository':{'full_name':'m-as23/ICC-Reports'},'run_attempt':1,'status':'completed','conclusion':'success','actor':{'login':'builder'},'path':'.github/workflows/fixture.yml','event':'workflow_dispatch'},'actions/artifacts/2':{'size_in_bytes':len(archive),'expired':False,'workflow_run':{'id':3,'head_sha':'a'*40},'digest':'sha256:'+hashlib.sha256(archive).hexdigest()},'actions/runs/3/jobs?per_page=100':{'total_count':1,'jobs':[{'status':'completed','conclusion':'success','completed_at':'2026-11-01T01:00:00Z'}]},'pulls/28/reviews?per_page=100':[review],'collaborators/reviewer/permission':self.permissions['reviewer']}
  import base64
  replies['contents/.github/workflows/fixture.yml?ref='+'a'*40]={'type':'file','path':'.github/workflows/fixture.yml','encoding':'base64','size':len(b'fixture-workflow'),'content':base64.b64encode(b'fixture-workflow').decode()}
  with patch('platform_approval.api',side_effect=lambda route:replies[route]),patch('platform_approval.subprocess.check_output',return_value=archive):
   result=fetch_pr_artifact_review(28,3,2,'a'*40,digest,'candidate.apk','c'*64,expected_workflow_path='.github/workflows/fixture.yml',expected_workflow_sha256=hashlib.sha256(b'fixture-workflow').hexdigest())
   self.assertEqual(result['artifactSha256'],digest);self.assertFalse(result['signingAuthorized'])
   replies['actions/runs/3']['path']='.github/workflows/unreviewed.yml'
   with self.assertRaisesRegex(ValueError,'TRUSTED_BUILD_WORKFLOW_REQUIRED'):fetch_pr_artifact_review(28,3,2,'a'*40,digest,'candidate.apk','c'*64,expected_workflow_path='.github/workflows/fixture.yml',expected_workflow_sha256=hashlib.sha256(b'fixture-workflow').hexdigest())
   replies['actions/runs/3']['path']='.github/workflows/fixture.yml'
   replies['collaborators/reviewer/permission']={'permission':'read','user':{'login':'reviewer'}}
   with self.assertRaises(ValueError):fetch_pr_artifact_review(28,3,2,'a'*40,digest,'candidate.apk','c'*64,expected_workflow_path='.github/workflows/fixture.yml',expected_workflow_sha256=hashlib.sha256(b'fixture-workflow').hexdigest())

if __name__=='__main__':unittest.main()
