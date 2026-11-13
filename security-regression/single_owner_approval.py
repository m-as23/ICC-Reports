"""Owner-approved single-owner policy, distinct from independent human review.
Read-only platform verification. No comment submission, approval, signing or deploy.
"""
import json,hashlib,re,datetime,base64,subprocess
from platform_approval import api,verify_artifact
REPO='m-as23/ICC-Reports'
ENV='maintrack-production-approval'

def parse(body):
 def unique(pairs):
  result={}
  for key,value in pairs:
   if key in result:raise ValueError('DUPLICATE_APPROVAL_FIELD')
   result[key]=value
  return result
 if not isinstance(body,str) or len(body.encode())>8192:raise ValueError('APPROVAL_BODY_BUDGET')
 return json.loads(body,object_pairs_hook=unique)

def date(value):
 value=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 if value.tzinfo is None:raise ValueError('PLATFORM_TIMEZONE_REQUIRED')
 return value

def build_completed_at(run_id,attempt):
 """Run responses lack completed_at; use the complete exact-attempt job page.
 Never substitute updated_at, an artifact timestamp, or the local clock.
 """
 try:
  if type(run_id) is not int or run_id<=0 or type(attempt) is not int or attempt!=1:raise ValueError()
  page=api(f'actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100')
  jobs=page['jobs']
  if not isinstance(jobs,list) or not 0<len(jobs)<100 or type(page['total_count']) is not int or page['total_count']!=len(jobs):raise ValueError()
  times=[]
  for job in jobs:
   if job['run_id']!=run_id or job['run_attempt']!=attempt or job['status']!='completed':raise ValueError()
   times.append(date(job['completed_at']))
  return max(times).isoformat()
 except (KeyError,TypeError,AttributeError,ValueError) as e:raise ValueError('BUILD_JOB_TIMES_REQUIRED') from e

def verify_owner(build,run,environment,reviews,comment,job,subject):
 try:
  if not re.fullmatch('[a-f0-9]{40}',subject['sourceCommit']) or any(not re.fullmatch('[a-f0-9]{64}',subject[k]) for k in ['artifactSha256','certificateSha256']):raise ValueError('OWNER_SUBJECT_REQUIRED')
  if any(type(subject[k]) is not int or subject[k]<=0 for k in ['artifactId','buildRunId']):raise ValueError('OWNER_PLATFORM_IDS_REQUIRED')
  for r in [build,run]:
   if r['repository']['full_name']!=REPO or r['head_sha']!=subject['sourceCommit'] or r['run_attempt']!=1:raise ValueError('OWNER_SOURCE_OR_ATTEMPT_MISMATCH')
  if build['id']!=subject['buildRunId'] or build['status']!='completed' or build['conclusion']!='success':raise ValueError('OWNER_BUILD_NOT_COMPLETE')
  rules=[r for r in environment['protection_rules'] if r['type']=='required_reviewers']
  if environment['name']!=ENV or environment['can_admins_bypass'] is not False or len(rules)!=1 or rules[0]['prevent_self_review'] is not False:raise ValueError('OWNER_ENVIRONMENT_POLICY_MISMATCH')
  if {r['reviewer']['login'] for r in rules[0]['reviewers'] if r['type']=='User'}!={'m-as23'}:raise ValueError('OWNER_ENVIRONMENT_REVIEWER_MISMATCH')
  if comment['user']!={**comment['user'],'login':'m-as23','type':'User'} or comment['issue_url']!='https://api.github.com/repos/'+REPO+'/issues/28':raise ValueError('REAL_OWNER_COMMENT_REQUIRED')
  expected={'kind':'maintrack-owner-artifact-signoff-v1',**subject}
  if parse(comment['body'])!=expected or comment['updated_at']!=comment['created_at']:raise ValueError('OWNER_ARTIFACT_NOT_EXPLICITLY_APPROVED')
  if job['run_id']!=run['id'] or job['name']!='pre-sign' or job['status'] not in ['in_progress','completed'] or job.get('conclusion') not in [None,'success']:raise ValueError('PROTECTED_GATE_JOB_REQUIRED')
  if not date(build['completed_at'])<=date(comment['created_at'])<=date(job['started_at']):raise ValueError('OWNER_REVIEW_ORDER_INVALID')
  binding={'kind':'maintrack-owner-environment-approval-v1','ownerCommentId':comment['id'],'bodySha256':hashlib.sha256(comment['body'].encode()).hexdigest()}
  if not isinstance(reviews,list) or len(reviews)>=100:raise ValueError('BOUNDED_REVIEW_HISTORY_REQUIRED')
  applicable=[r for r in reviews if any(e['name']==ENV for e in r.get('environments',[]))]
  if not applicable:raise ValueError('REAL_OWNER_ENVIRONMENT_APPROVAL_REQUIRED')
  r=applicable[-1]
  if r['state']!='approved' or r['user']['login']!='m-as23' or r['user']['type']!='User' or parse(r.get('comment',''))!=binding:raise ValueError('REAL_OWNER_ENVIRONMENT_APPROVAL_REQUIRED')
  return {'kind':'github-single-owner-artifact-approval-v1','governancePolicy':'single-owner-v1','repository':REPO,'environment':ENV,'reviewer':'m-as23','runId':run['id'],**subject,'approved':True,'independentReview':False,'ownerSignoffAt':comment['created_at'],'approvalObservedBy':job['started_at'],'commentId':comment['id'],'preventSelfReview':False,'adminBypass':False,'signingAuthorized':False,'deploymentAuthorized':False}
 except (KeyError,TypeError,AttributeError) as e:raise ValueError('INCOMPLETE_OWNER_PLATFORM_PROOF') from e

def fetch_owner_approval(build_run_id,approval_run_id,artifact_id,comment_id,commit,digest,apk_name,certificate,*,workflow_path,workflow_sha256,build_workflow_path,build_workflow_sha256):
 """Caller supplies reviewed workflow pins, never a candidate approval JSON."""
 if any(type(x) is not int or x<=0 for x in [build_run_id,approval_run_id,artifact_id,comment_id]):raise ValueError('OWNER_PLATFORM_IDS_REQUIRED')
 for p,h in [(workflow_path,workflow_sha256),(build_workflow_path,build_workflow_sha256)]:
  if not re.fullmatch(r'\.github/workflows/[A-Za-z0-9_-]+\.ya?ml',p or '') or not re.fullmatch('[a-f0-9]{64}',h or ''):raise ValueError('TRUSTED_OWNER_WORKFLOW_PIN_REQUIRED')
 if not re.fullmatch(r'[A-Za-z0-9._-]+\.apk',apk_name or ''):raise ValueError('APK_BASENAME_REQUIRED')
 build=api(f'actions/runs/{build_run_id}');run=api(f'actions/runs/{approval_run_id}')
 if run.get('path')!=workflow_path or build.get('path')!=build_workflow_path:raise ValueError('OWNER_GATE_WORKFLOW_MISMATCH')
 for p,h in [(workflow_path,workflow_sha256),(build_workflow_path,build_workflow_sha256)]:
  f=api(f'contents/{p}?ref={commit}')
  if f.get('type')!='file' or f.get('encoding')!='base64' or not 0<f.get('size',0)<=262144:raise ValueError('OWNER_WORKFLOW_SOURCE_REQUIRED')
  raw=base64.b64decode(''.join(f['content'].split()),validate=True)
  if hashlib.sha256(raw).hexdigest()!=h:raise ValueError('OWNER_WORKFLOW_CHANGED')
 meta=api(f'actions/artifacts/{artifact_id}');archive=subprocess.check_output(['gh','api',f'repos/{REPO}/actions/artifacts/{artifact_id}/zip'],timeout=60)
 verify_artifact(meta,archive,build_run_id,commit,digest,apk_name)
 build={**build,'completed_at':build_completed_at(build_run_id,build.get('run_attempt'))}
 jobs=api(f'actions/runs/{approval_run_id}/jobs?per_page=100')['jobs'];selected=[j for j in jobs if j['name']=='pre-sign']
 if len(jobs)>=100 or len(selected)!=1:raise ValueError('UNAMBIGUOUS_OWNER_GATE_JOB_REQUIRED')
 subject={'sourceCommit':commit,'artifactSha256':digest,'certificateSha256':certificate,'artifactId':artifact_id,'buildRunId':build_run_id}
 return verify_owner(build,run,api(f'environments/{ENV}'),api(f'actions/runs/{approval_run_id}/approvals'),api(f'issues/comments/{comment_id}'),selected[0],subject)
