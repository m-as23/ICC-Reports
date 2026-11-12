"""Read-only GitHub approval verification; no approval is accepted from test evidence.
Must execute from independently reviewed trusted workflow code before secrets/signing.
https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
"""
import json,subprocess,hashlib,zipfile,io,re,datetime,base64
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
 if expected.lower()=='aae0b7fe57ae5e65749c8967861918b7bb9a6ff9275ee980c96b88d4a01ca5fe':raise ValueError('QA_DEBUG_CERTIFICATE_NOT_RELEASE')
 output=subprocess.check_output([apksigner,'verify','--print-certs',str(apk)],text=True,timeout=30)
 if re.search(r'^Signer #\d+ certificate DN:.*\bCN\s*=\s*Android Debug(?:,|$)',output,re.MULTILINE|re.IGNORECASE):raise ValueError('ANDROID_DEBUG_CERTIFICATE_NOT_RELEASE')
 digests=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})$',output,re.MULTILINE)
 if len(digests)!=1 or digests[0].lower()!=expected.lower():raise ValueError('SIGNING_CERTIFICATE_MISMATCH')
 return digests[0].lower()


def verify_pr_artifact_review(pr,reviews,permissions,subject,build_completed_at):
 """Verify raw API review against an already API-verified unsigned subject.
 Run only from reviewed trusted code. Candidate files are never review authority.
 Result deliberately lacks latest-push/environ receipts and cannot authorize signing.
 """
 def date(value):
  d=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
  if d.tzinfo is None:raise ValueError('REVIEW_TIMEZONE_REQUIRED')
  return d
 def unique(pairs):
  result={}
  for k,v in pairs:
   if k in result:raise ValueError('AMBIGUOUS_REVIEW_BODY')
   result[k]=v
  return result
 try:
  commit=subject['sourceCommit'];author=pr['user']['login']
  if not author or pr.get('state')!='open' or pr.get('draft') is not False or pr['head']['sha']!=commit or pr['head']['repo']['full_name']!=REPO or pr['base']['repo']['full_name']!=REPO:raise ValueError('PR_NOT_REVIEWABLE_OR_SOURCE_CHANGED')
  if not re.fullmatch('[a-f0-9]{40}',commit) or any(not re.fullmatch('[a-f0-9]{64}',subject[k]) for k in ['artifactSha256','certificateSha256']):raise ValueError('REVIEW_SUBJECT_REQUIRED')
  if any(type(subject[k]) is not int or subject[k]<=0 for k in ['artifactId','buildRunId']) or not subject.get('buildActor'):raise ValueError('VERIFIED_BUILD_REQUIRED')
  if not isinstance(reviews,list) or len(reviews)>=100:raise ValueError('BOUNDED_COMPLETE_REVIEW_PAGE_REQUIRED')
  expected={'kind':'maintrack-artifact-review-v1',**{k:subject[k] for k in ['sourceCommit','artifactSha256','certificateSha256','artifactId','buildRunId']}}
  latest={}
  for r in sorted(reviews,key=lambda x:(date(x['submitted_at']),x['id'])):
   name=r['user']['login'];permission=permissions.get(name,{})
   if permission.get('permission') not in ['write','maintain','admin'] or permission.get('user',{}).get('login')!=name or r['user'].get('type')!='User':continue
   if r.get('state') in ['APPROVED','CHANGES_REQUESTED','DISMISSED']:latest[name]=r
  if any(r['state']=='CHANGES_REQUESTED' for r in latest.values()):raise ValueError('AUTHORIZED_CHANGES_REQUESTED')
  for name,r in latest.items():
   if r['state']!='APPROVED' or r['commit_id']!=commit or name in [author,subject['buildActor']]:continue
   if date(r['submitted_at'])<date(build_completed_at):continue
   body=r.get('body','')
   if not isinstance(body,str) or len(body.encode())>8192:continue
   try:binding=json.loads(body,object_pairs_hook=unique)
   except (ValueError,TypeError):continue
   if binding!=expected:continue
   return {'kind':'github-pr-artifact-review-v1','state':'APPROVED','authorized':True,'reviewer':name,'prAuthor':author,'sourceCommit':commit,'artifactSha256':subject['artifactSha256'],'certificateSha256':subject['certificateSha256'],'artifactId':subject['artifactId'],'buildRunId':subject['buildRunId'],'reviewId':r['id'],'submittedAt':r['submitted_at'],'latestPusher':None,'lastPushApprovalEnforced':False,'signingAuthorized':False,'deploymentAuthorized':False,'remaining':['VERIFIED_LATEST_PUSH_IDENTITY_AND_ENFORCEMENT','PROTECTED_ENVIRONMENT_APPROVAL_AND_AUTHORITATIVE_ORDER']}
  raise ValueError('BOUND_INDEPENDENT_ARTIFACT_REVIEW_MISSING')
 except (KeyError,TypeError,AttributeError) as e:raise ValueError('INCOMPLETE_PLATFORM_REVIEW') from e


def fetch_pr_artifact_review(pr_number,build_run_id,artifact_id,commit,apk_digest,apk_name,certificate,*,expected_workflow_path=None,expected_workflow_sha256=None):
 """Read-only, bounded collector. No submission/approval/signing/deployment.
 Trusted workflow policy must supply IDs and certificate, not an untrusted report.
 """
 if not isinstance(expected_workflow_path,str) or not re.fullmatch(r'\.github/workflows/[A-Za-z0-9_-]+\.ya?ml',expected_workflow_path) or not isinstance(expected_workflow_sha256,str) or not re.fullmatch('[a-f0-9]{64}',expected_workflow_sha256):raise ValueError('TRUSTED_WORKFLOW_PIN_REQUIRED')
 if not re.fullmatch('[a-f0-9]{40}',commit or ''):raise ValueError('SOURCE_COMMIT_REQUIRED')
 for value in [pr_number,build_run_id,artifact_id]:
  if type(value) is not int or value<=0:raise ValueError('PLATFORM_ID_REQUIRED')
 if not re.fullmatch('[A-Za-z0-9._-]+[.]apk',apk_name):raise ValueError('APK_BASENAME_REQUIRED')
 pr=api(f'pulls/{pr_number}')
 if pr.get('draft') is not False or pr.get('state')!='open':raise ValueError('PR_NOT_REVIEWABLE')
 run=api(f'actions/runs/{build_run_id}')
 if run.get('head_sha')!=commit or run.get('repository',{}).get('full_name')!=REPO or run.get('run_attempt')!=1 or run.get('conclusion')!='success' or run.get('status')!='completed':raise ValueError('TRUSTED_BUILD_REQUIRED')
 if run.get('path')!=expected_workflow_path or run.get('event') not in ['push','workflow_dispatch']:raise ValueError('TRUSTED_BUILD_WORKFLOW_REQUIRED')
 workflow=api(f'contents/{expected_workflow_path}?ref={commit}')
 if workflow.get('type')!='file' or workflow.get('path')!=expected_workflow_path or workflow.get('encoding')!='base64' or type(workflow.get('size')) is not int or not 0<workflow['size']<=262144 or len(workflow.get('content',''))>360000:raise ValueError('TRUSTED_WORKFLOW_SOURCE_REQUIRED')
 try:workflow_bytes=base64.b64decode(''.join(workflow['content'].split()),validate=True)
 except (ValueError,TypeError) as e:raise ValueError('TRUSTED_WORKFLOW_SOURCE_REQUIRED') from e
 if len(workflow_bytes)!=workflow['size'] or hashlib.sha256(workflow_bytes).hexdigest()!=expected_workflow_sha256:raise ValueError('TRUSTED_WORKFLOW_PIN_MISMATCH')
 meta=api(f'actions/artifacts/{artifact_id}')
 if not isinstance(meta.get('size_in_bytes'),int) or not 0<meta['size_in_bytes']<=256*1024*1024:raise ValueError('ARTIFACT_BUDGET')
 archive=subprocess.check_output(['gh','api',f'repos/{REPO}/actions/artifacts/{artifact_id}/zip'],timeout=60)
 verify_artifact(meta,archive,build_run_id,commit,apk_digest,apk_name)
 jobs=api(f'actions/runs/{build_run_id}/jobs?per_page=100')
 if not jobs.get('jobs') or jobs.get('total_count')!=len(jobs['jobs']) or len(jobs['jobs'])>=100 or any(j['status']!='completed' for j in jobs['jobs']):raise ValueError('BUILD_JOB_TIMES_REQUIRED')
 completed=max(j['completed_at'] for j in jobs['jobs'] if j['conclusion']=='success' and j.get('completed_at'))
 reviews=api(f'pulls/{pr_number}/reviews?per_page=100');names={r['user']['login'] for r in reviews}
 if len(reviews)>=100 or len(names)>10:raise ValueError('REVIEW_READ_BUDGET')
 permissions={}
 for name in sorted(names):
  if not re.fullmatch('[A-Za-z0-9-]{1,39}',name):raise ValueError('REVIEW_LOGIN_REQUIRED')
  permissions[name]=api(f'collaborators/{name}/permission')
 subject={'sourceCommit':commit,'artifactSha256':apk_digest,'certificateSha256':certificate,'artifactId':artifact_id,'buildRunId':build_run_id,'buildActor':run['actor']['login']}
 return verify_pr_artifact_review(pr,reviews,permissions,subject,completed)
