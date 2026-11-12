import hashlib,json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from release_gate import candidate_build_proven
class FrameGateTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name);self.commit='a'*40;self.client=b'synthetic-client';self.digest=hashlib.sha256(self.client).hexdigest();(self.root/'client.js').write_bytes(self.client)
  self.paths=['/','/index.html','/index','/inventory-reference.html','/inventory-reference','/qa-security.html','/qa-security','/security-final-check.html','/security-final-check']
 def build(self,paths):
  headers=[{'source':'/(.*)','headers':[{'key':'X-Frame-Options','value':'SAMEORIGIN'}]}]+[{'source':p,'headers':[{'key':'X-Frame-Options','value':'SAMEORIGIN'},{'key':'Content-Security-Policy','value':"frame-ancestors 'self';"}]} for p in paths]
  proof={'sourceCommit':self.commit,'canonicalLocksModified':False,'changes':[{'path':p,'before':'b'*64,'after':self.digest,'origin':'PR27'} for p in ['web/secure-assets/index-inline-1.js','native/www/secure-assets/index-inline-1.js']],'headerPolicy':headers}
  (self.root/'proof.json').write_text(json.dumps(proof));(self.root/'headers.json').write_text(json.dumps({'headers':headers}))
  entry=lambda p:{'path':p,'sha256':hashlib.sha256((self.root/p).read_bytes()).hexdigest()}
  return {'candidateBuild':{'provenance':entry('proof.json'),'webClient':entry('client.js'),'webHeaders':entry('headers.json')}}
 def test_complete_page_and_alias_coverage_passes_build_subcheck_only(self):
  self.assertTrue(candidate_build_proven(self.root,self.build(self.paths),self.commit,self.digest))
 def test_old_three_route_policy_cannot_authorize_artifact(self):
  self.assertFalse(candidate_build_proven(self.root,self.build(['/','/index.html','/inventory-reference.html']),self.commit,self.digest))
 def test_missing_each_page_or_alias_is_rejected_even_with_consistent_local_hashes(self):
  for p in self.paths:
   with self.subTest(path=p):self.assertFalse(candidate_build_proven(self.root,self.build([x for x in self.paths if x!=p]),self.commit,self.digest))
if __name__=='__main__':unittest.main()
