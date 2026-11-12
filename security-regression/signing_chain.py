"""Local pre/post-sign contract. Platform receipts MUST come from trusted code.
No file/CLI flag can manufacture platform approval; no signing or publication here.
Tests use synthetic receipts and mock apksigner; PASS never authorizes deployment.
"""
import datetime,hashlib,pathlib,re,struct,zipfile
from platform_approval import verify_certificate
from release_gate import REQUIRED
REPO='m-as23/ICC-Reports'
ENV='maintrack-production-approval'
def sha(data):return hashlib.sha256(data).hexdigest()
def file_bytes(path):
 p=pathlib.Path(path)
 if p.stat().st_size>256*1024*1024:raise ValueError('APK_FILE_BUDGET')
 return p.read_bytes()
def time(value):
 d=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 if d.tzinfo is None:raise ValueError('timezone required')
 return d

def payload(apk,*,unsigned=False):
 result={};total=0
 if unsigned:
  # v2/v3 signing lives outside ZIP entries, immediately before the central
  # directory. Reject ambiguous/ZIP64 layouts rather than declaring unsigned.
  raw=file_bytes(apk);end=raw.rfind(b'PK\x05\x06',max(0,len(raw)-65557))
  if end<0 or end+22>len(raw):raise ValueError('APK_END_RECORD_REQUIRED')
  disk,central_disk,on_disk,entries,size,offset,comment=struct.unpack_from('<HHHHIIH',raw,end+4)
  if end+22+comment!=len(raw) or disk or central_disk or on_disk!=entries or entries==65535 or size==0xffffffff or offset==0xffffffff or offset+size!=end:raise ValueError('APK_AMBIGUOUS_DIRECTORY')
  if offset>=24 and raw[offset-16:offset]==b'APK Sig Block 42':raise ValueError('PRE_SIGN_INPUT_NOT_UNSIGNED')
 with zipfile.ZipFile(apk) as z:
  if len(z.infolist())>50000:raise ValueError('APK_ENTRY_BUDGET')
  for e in z.infolist():
   if e.is_dir():continue
   name=e.filename
   if name in result or name.startswith('/') or '\\' in name or '..' in name.split('/') or e.flag_bits&1:raise ValueError('APK_AMBIGUOUS_ENTRY')
   signature=bool(re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[A-Z0-9_-]{1,64}\.(?:SF|RSA|DSA|EC))',name))
   if signature:
    if unsigned:raise ValueError('PRE_SIGN_INPUT_NOT_UNSIGNED')
    # Still reject duplicate signature entries and enforce their size.
    if e.file_size>1024*1024:raise ValueError('SIGNATURE_ENTRY_BUDGET')
    if sum(x.filename==name for x in z.infolist())!=1:raise ValueError('APK_AMBIGUOUS_ENTRY')
    continue
   total+=e.file_size
   if total>256*1024*1024 or e.file_size>128*1024*1024:raise ValueError('APK_CONTENT_BUDGET')
   result[name]=sha(z.read(e))
 if not result or 'AndroidManifest.xml' not in result:raise ValueError('APK_PAYLOAD_REQUIRED')
 return result

def pre_sign(candidate,unsigned_apk,*,platform=None,now=None,owner_approval=None):
 """Separate trusted platform argument cannot be supplied by candidate evidence.
 Normalized receipts include artifact/cert review binding and authoritative times.
 Missing/unavailable real review timestamps fail closed; do not infer them locally.
 """
 reasons=[];candidate=candidate if isinstance(candidate,dict) else {};platform=platform if isinstance(platform,dict) else {}
 try:
  commit=candidate['sourceCommit'];digest=sha(file_bytes(unsigned_apk));manifest=payload(unsigned_apk,unsigned=True)
  if candidate.get('repository')!=REPO or not re.fullmatch('[a-f0-9]{40}',commit):reasons.append('INVALID_SOURCE')
  if candidate.get('artifactSha256')!=digest:reasons.append('UNSIGNED_ARTIFACT_CHANGED')
  cert=candidate.get('certificateSha256');
  if not isinstance(cert,str) or not re.fullmatch('[a-f0-9]{64}',cert):reasons.append('REVIEWED_PUBLIC_CERTIFICATE_REQUIRED')
  if isinstance(cert,str) and cert.lower()=='aae0b7fe57ae5e65749c8967861918b7bb9a6ff9275ee980c96b88d4a01ca5fe':reasons.append('QA_DEBUG_CERTIFICATE_NOT_RELEASE')
  build=platform.get('build',{});review=platform.get('review',{});approval=platform.get('approval',{});gate=platform.get('securityGate',{})
  single=owner_approval is not None
  if single:
   review=approval=owner_approval if isinstance(owner_approval,dict) else {}
   if review.get('kind')!='github-single-owner-artifact-approval-v1' or review.get('governancePolicy')!='single-owner-v1' or review.get('repository')!=REPO or review.get('reviewer')!='m-as23' or review.get('approved') is not True or review.get('independentReview') is not False:reasons.append('REAL_SINGLE_OWNER_PROOF_REQUIRED')
  if platform.get('repository')!=REPO:reasons.append('TRUSTED_PLATFORM_RECEIPTS_REQUIRED')
  for proof in [build,review,approval,gate]:
   if proof.get('sourceCommit')!=commit or proof.get('artifactSha256')!=digest or proof.get('artifactId')!=candidate.get('artifactId'):reasons.append('PLATFORM_BINDING_MISMATCH')
  if type(candidate.get('artifactId')) is not int or candidate['artifactId']<=0 or type(candidate.get('buildRunId')) is not int or candidate['buildRunId']<=0:reasons.append('INVALID_PLATFORM_ID')
  if build.get('runId')!=candidate.get('buildRunId') or build.get('conclusion')!='success' or build.get('attempt')!=1 or build.get('workflowPath')!=candidate.get('workflowPath'):reasons.append('TRUSTED_BUILD_REQUIRED')
  if not isinstance(candidate.get('workflowPath'),str) or not re.fullmatch(r'\.github/workflows/[A-Za-z0-9_-]+\.ya?ml',candidate['workflowPath']):reasons.append('REVIEWED_WORKFLOW_REQUIRED')
  if not single:
   # These identities must be supplied by reviewed platform integration, never candidate fields.
   trusted_author=review.get('prAuthor');trusted_pusher=review.get('latestPusher')
   if not isinstance(trusted_author,str) or not trusted_author or not isinstance(trusted_pusher,str) or not trusted_pusher or review.get('lastPushApprovalEnforced') is not True:reasons.append('TRUSTED_PR_AND_PUSH_IDENTITIES_REQUIRED')
   if candidate.get('prAuthor')!=trusted_author:reasons.append('PR_AUTHOR_PLATFORM_MISMATCH')
   if review.get('state')!='APPROVED' or review.get('authorized') is not True or not review.get('reviewer') or review.get('reviewer') in [trusted_author,trusted_pusher,build.get('actor')]:reasons.append('INDEPENDENT_HUMAN_REVIEW_REQUIRED')
   if approval.get('state')!='approved' or approval.get('reviewer')!='m-as23' or approval.get('reviewer') in [approval.get('actor'),build.get('actor')] or approval.get('authorized') is not True or approval.get('preventSelfReview') is not True or approval.get('adminBypass') is not False or approval.get('environment')!=ENV:reasons.append('REAL_PROTECTED_OWNER_APPROVAL_REQUIRED')
  elif approval.get('environment')!=ENV or approval.get('preventSelfReview') is not False or approval.get('adminBypass') is not False:reasons.append('REAL_PROTECTED_OWNER_APPROVAL_REQUIRED')
  if approval.get('buildRunId')!=candidate.get('buildRunId') or review.get('certificateSha256')!=cert or approval.get('certificateSha256')!=cert:reasons.append('REVIEWED_SIGNING_BINDING_MISMATCH')
  if gate.get('status')!='PASS' or any(gate.get('cases',{}).get(x)!='PASS' for x in REQUIRED):reasons.append('MANDATORY_SECURITY_GATE_NOT_PASS')
  current=now or datetime.datetime.now(datetime.timezone.utc)
  if single:
   if not(time(build['completedAt'])<=time(review['ownerSignoffAt'])<=time(approval['approvalObservedBy'])<=current):reasons.append('REVIEW_APPROVAL_ORDER_INVALID')
  elif not(time(build['completedAt'])<=time(review['submittedAt'])<time(approval['approvedAt'])<=current):reasons.append('REVIEW_APPROVAL_ORDER_INVALID')
 except (KeyError,TypeError,ValueError,OSError,zipfile.BadZipFile):
  reasons.append('INCOMPLETE_OR_INVALID_PRE_SIGN_PROOF');commit=candidate.get('sourceCommit');digest=None;manifest=None;cert=candidate.get('certificateSha256')
 return {'kind':'maintrack-pre-sign-contract-v1','stage':'PRE_SIGN','status':'BLOCKED' if reasons else 'PASS','reasons':sorted(set(reasons)),'sourceCommit':commit,'unsignedSha256':digest,'payload':manifest,'certificateSha256':cert,'approvedAt':owner_approval.get('ownerSignoffAt') if isinstance(owner_approval,dict) else platform.get('approval',{}).get('approvedAt'),'approvalObservedBy':owner_approval.get('approvalObservedBy') if isinstance(owner_approval,dict) else None,'governancePolicy':'single-owner-v1' if owner_approval is not None else 'independent-v1','artifactId':candidate.get('artifactId'),'buildRunId':candidate.get('buildRunId'),'signingAuthorized':False,'deploymentAuthorized':False}

def post_sign(pre,unsigned_apk,signed_apk,*,apksigner,signing=None):
 reasons=[];signed_digest=None;pre=pre if isinstance(pre,dict) else {}
 try:
  if pre.get('kind')!='maintrack-pre-sign-contract-v1' or pre.get('status')!='PASS':raise ValueError('PRE_SIGN_NOT_PASS')
  unsigned=file_bytes(unsigned_apk);signed=file_bytes(signed_apk);signed_digest=sha(signed)
  if sha(unsigned)!=pre.get('unsignedSha256') or payload(unsigned_apk,unsigned=True)!=pre.get('payload'):reasons.append('UNSIGNED_ARTIFACT_SUBSTITUTED')
  if payload(signed_apk)!=pre.get('payload'):reasons.append('SIGNED_PAYLOAD_SUBSTITUTED')
  receipt=signing if isinstance(signing,dict) else {}
  if receipt.get('kind')!='trusted-signing-job-v1' or receipt.get('sourceCommit')!=pre.get('sourceCommit') or receipt.get('unsignedSha256')!=pre.get('unsignedSha256') or receipt.get('signedSha256')!=signed_digest or receipt.get('certificateSha256')!=pre.get('certificateSha256') or receipt.get('buildRunId')!=pre.get('buildRunId') or type(receipt.get('signingRunId')) is not int or receipt['signingRunId']<=0:reasons.append('TRUSTED_SIGNING_RECEIPT_REQUIRED')
  if not receipt.get('signedAt') or not pre.get('approvedAt') or time(receipt['signedAt'])<time(pre['approvedAt']):reasons.append('SIGNING_PRECEDES_APPROVAL_OR_TIME_UNPROVEN')
  if pre.get('approvalObservedBy') and time(receipt['signedAt'])<time(pre['approvalObservedBy']):reasons.append('SIGNING_PRECEDES_ENVIRONMENT_APPROVAL_OBSERVATION')
  verify_certificate(apksigner,signed_apk,pre.get('certificateSha256'))
 except Exception as e:
  # No signing/deploy side effect; all verifier, ZIP and process failures block.
  reasons.append('POST_SIGN_VERIFICATION_FAILED:'+type(e).__name__)
 return {'stage':'POST_SIGN','status':'BLOCKED' if reasons else 'PASS','reasons':reasons,'sourceCommit':pre.get('sourceCommit'),'unsignedSha256':pre.get('unsignedSha256'),'signedSha256':signed_digest,'certificateSha256':pre.get('certificateSha256'),'deploymentAuthorized':False}
