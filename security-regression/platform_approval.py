"""Read-only GitHub approval verification; no approval is accepted from test evidence.
Must execute from independently reviewed trusted workflow code before secrets/signing.
https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
"""
import json,subprocess,hashlib,zipfile,io,re
REPO='m-as23/ICC-Reports'
ENVIRONMENT='maintrack-production-approval'
def api(path):
 return json.loads(subprocess.check_output(['gh','api',f'repos/{REPO}/'+path],text=True,timeout=20))
def verify(run,environment,reviews,commit,artifact):
 if run.get('repository',{}).get('full_name')!=REPO or run.get('head_sha')!=commit or run.get('run_attempt')!=1:raise ValueError('RUN_BINDING_OR_RETRY')
 if environment.get('name')!=ENVIRONMENT or environment.get('can_admins_bypass') is not False:raise ValueError('ENVIRONMENT_NOT_PROTECTED')
 rules=[r for r in environment.get('protection_rules',[]) if r.get('type')=='required_reviewers']
 if len(rules)!=1 or rules[0].get('prevent_self_review') is not True:raise ValueError('INDEPENDENT_REVIEW_NOT_ENFORCED')
 allowed={x.get('reviewer',{}).get('login') for x in rules[0].get('reviewers',[]) if x.get('type')=='User'}
 actors={run.get('actor',{}).get('login'),run.get('triggering_actor',{}).get('login')}
 # Current policy explicitly requires repository owner approval. Do not invent it.
 for review in reversed(reviews):
  if any(e.get('name')==ENVIRONMENT for e in review.get('environments',[])):
   reviewer=review.get('user',{}).get('login')
   if review.get('state')!='approved' or reviewer!='m-as23' or reviewer not in allowed or reviewer in actors:raise ValueError('OWNER_APPROVAL_MISSING_OR_SELF')
   return {'kind':'github-environment-review-v1','repository':REPO,'environment':ENVIRONMENT,'reviewer':reviewer,'runId':run['id'],'sourceCommit':commit,'artifactSha256':artifact,'approved':True}
 raise ValueError('PLATFORM_APPROVAL_MISSING')
def verify_artifact(meta,archive,run_id,commit,apk_digest,apk_name):
 if meta.get('expired') is not False or meta.get('workflow_run',{}).get('id')!=int(run_id) or meta.get('workflow_run',{}).get('head_sha')!=commit:raise ValueError('ARTIFACT_RUN_MISMATCH')
 if meta.get('digest')!='sha256:'+hashlib.sha256(archive).hexdigest():raise ValueError('ARTIFACT_ARCHIVE_CHANGED')
 if len(archive)>256*1024*1024:raise ValueError('ARTIFACT_BUDGET')
 with zipfile.ZipFile(io.BytesIO(archive)) as z:
  entries=[e for e in z.infolist() if e.filename==apk_name or e.filename.endswith('/'+apk_name)]
  if len(entries)!=1 or entries[0].file_size>128*1024*1024:raise ValueError('APK_ARTIFACT_AMBIGUOUS')
  if hashlib.sha256(z.read(entries[0])).hexdigest()!=apk_digest:raise ValueError('APK_NOT_FROM_PLATFORM_ARTIFACT')
 return True

def fetch_approval(run_id,commit,artifact,artifact_id=None,apk_name=None):
 if not str(run_id).isdigit():raise ValueError('INVALID_RUN')
 if not str(artifact_id).isdigit() or not apk_name:raise ValueError('PLATFORM_ARTIFACT_REQUIRED')
 meta=api(f'actions/artifacts/{artifact_id}')
 archive=subprocess.check_output(['gh','api',f'repos/{REPO}/actions/artifacts/{artifact_id}/zip'],timeout=60)
 verify_artifact(meta,archive,run_id,commit,artifact,apk_name)
 return verify(api(f'actions/runs/{run_id}'),api(f'environments/{ENVIRONMENT}'),api(f'actions/runs/{run_id}/approvals'),commit,artifact)
def native_client_hash(apk):
 # Hash only the exact APK entry; never extract attacker-controlled ZIP paths.
 with zipfile.ZipFile(apk) as z:
  entries=[e for e in z.infolist() if e.filename=='assets/public/secure-assets/index-inline-1.js']
  if len(entries)!=1 or entries[0].file_size>8*1024*1024:raise ValueError('NATIVE_CLIENT_ENTRY_INVALID')
  return hashlib.sha256(z.read(entries[0])).hexdigest()

def verify_certificate(apksigner,apk,expected):
 if not isinstance(expected,str) or not re.fullmatch(r'[a-fA-F0-9]{64}',expected):raise ValueError('REVIEWED_CERTIFICATE_REQUIRED')
 output=subprocess.check_output([apksigner,'verify','--print-certs',str(apk)],text=True,timeout=30)
 digests=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})$',output,re.MULTILINE)
 if len(digests)!=1 or digests[0].lower()!=expected.lower():raise ValueError('SIGNING_CERTIFICATE_MISMATCH')
 return digests[0].lower()
