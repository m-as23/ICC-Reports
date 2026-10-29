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
if __name__=='__main__':unittest.main()
