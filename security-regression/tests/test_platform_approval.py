import unittest,sys,pathlib,copy,tempfile,zipfile,hashlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from platform_approval import verify,native_client_hash
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
if __name__=='__main__':unittest.main()
