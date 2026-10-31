import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from run import ci_identity
class CiIdentityTests(unittest.TestCase):
 def runner(self,args,**kwargs):return 'a'*40+'\n' if args[1]=='rev-parse' else ''
 def env(self):return {'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':'m-as23/ICC-Reports','MAINTRACK_CANDIDATE_SHA':'a'*40,'GITHUB_SHA':'b'*40,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'security-local','GITHUB_WORKFLOW_REF':'m-as23/ICC-Reports/.github/workflows/maintrack-security-local.yml@refs/pull/28/merge'}
 def test_pr_head_matches_checkout_even_if_event_merge_sha_differs(self):
  proof=ci_identity(pathlib.Path('.'),self.env(),self.runner);self.assertEqual(proof['sourceCommit'],'a'*40);self.assertEqual(proof['github']['runId'],123);self.assertFalse(proof['approvalConferred'])
 def test_wrong_head_missing_run_and_wrong_repository_refuse_ci_execution(self):
  for patch in [{'MAINTRACK_CANDIDATE_SHA':'c'*40},{'GITHUB_RUN_ID':''},{'GITHUB_REPOSITORY':'other/repo'}]:
   with self.subTest(patch=patch):self.assertRaises(ValueError,ci_identity,pathlib.Path('.'),{**self.env(),**patch},self.runner)
 def test_local_report_has_source_identity_but_no_ci_or_approval(self):
  proof=ci_identity(pathlib.Path('.'),{},self.runner);self.assertIsNone(proof['github']);self.assertFalse(proof['approvalConferred'])
 def test_dirty_ci_checkout_cannot_be_reported_as_the_reviewed_candidate(self):
  def runner(args,**kwargs):return 'a'*40+'\n' if args[1]=='rev-parse' else ' M source.js\n'
  self.assertRaises(ValueError,ci_identity,pathlib.Path('.'),self.env(),runner)
if __name__=='__main__':unittest.main()
