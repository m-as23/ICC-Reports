"""Offline, fail-closed release evidence gate. Never authorizes deployment by itself."""
import argparse,datetime,hashlib,json,pathlib,re,subprocess
REQUIRED=('login-rate-isolation','login-admission-policy','excel-dependency-review','logout-core-401','logout-inventory-401','other-session-survives','unauthorized-access','owner-permissions','engineer-permissions','technician-permissions','inventory-authenticated-writes','inventory-xlsx-new-item','ep001-authenticated-shell','android-integrated-runtime','android-tls-rejection','ota-operational-parity','qa-production-diff-reviewed','qa-cleanup')

def cleanup_proven(root,entries,commit,artifact):
    """A closed admission window alone never proves cleanup or its deadline."""
    for entry in entries:
        try:
            relative=pathlib.Path(entry['path']);file=(root/relative).resolve()
            if relative.is_absolute() or not file.is_relative_to(root):continue
            data=file.read_bytes()
            if sha(data)!=entry.get('sha256'):continue
            proof=json.loads(data)
            if not isinstance(proof,dict) or proof.get('kind')!='maintrack-server-cleanup-v1':continue
            if proof.get('projectRef')!='szhstrafzkxzstjdcynl' or proof.get('sourceCommit')!=commit or proof.get('artifactSha256')!=artifact:continue
            if not all(proof.get(key) is True for key in ('serverClock','admissionClosed','sessionsInactive','baselineVerified','archivesRetained','serverSchedulerProven','controllerFailureExercised','storageObjectsReconciled','schedulerStopped','serverTimeoutProven')):continue
            times=[datetime.datetime.fromisoformat(proof[key].replace('Z','+00:00')) for key in ('startedAt','admitUntil','deadline','verifiedAt')]
            if any(t.tzinfo is None for t in times):continue
            start,admit,deadline,verified=times
            if start<admit<deadline and start<=verified<=deadline and (deadline-start).total_seconds()<=2700:return True
        except (KeyError,ValueError,OSError,TypeError,AttributeError):continue
    return False
def sha(data):return hashlib.sha256(data).hexdigest()
def source_dirty(root):
    return bool(subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=root,text=True).strip())
def candidate_build_proven(root,record,commit,native_hash):
    try:
        def read(entry):
            relative=pathlib.Path(entry['path']); file=(root/relative).resolve()
            if relative.is_absolute() or not file.is_relative_to(root):raise ValueError('OUTSIDE_ROOT')
            data=file.read_bytes()
            if sha(data)!=entry['sha256']:raise ValueError('CHANGED')
            return data
        build=record['candidateBuild']; provenance=json.loads(read(build['provenance']))
        client_hash=sha(read(build['webClient'])); headers=json.loads(read(build['webHeaders']))['headers']
        if provenance.get('sourceCommit')!=commit or provenance.get('canonicalLocksModified') is not False:return False
        changes=provenance.get('changes',[])
        for path,digest in [('web/secure-assets/index-inline-1.js',client_hash),('native/www/secure-assets/index-inline-1.js',native_hash)]:
            if not digest or not any(x.get('path')==path and x.get('after')==digest and x.get('before')!=digest and x.get('origin')=='PR27' for x in changes):return False
        for path in ('/','/index.html','/inventory-reference.html'):
            rules=[x for x in headers if x.get('source')==path]
            if not rules:return False
            values={h['key'].lower():h['value'] for h in rules[0]['headers']}
            if values.get('x-frame-options')!='SAMEORIGIN' or "frame-ancestors 'self'" not in values.get('content-security-policy',''):return False
        return headers==provenance.get('headerPolicy')
    except (KeyError,ValueError,OSError,TypeError,AttributeError):return False

def evaluate(root,record,commit,artifact,*,approval=None,native_client_sha256=None):
    root=pathlib.Path(root).resolve();reasons=[]
    # Only a trusted platform integration may supply this argument. Record fields
    # cannot confer approval. CLI has no such integration and remains fail-closed.
    if not isinstance(approval,dict) or not all((approval.get('kind')=='github-environment-review-v1',approval.get('repository')=='m-as23/ICC-Reports',approval.get('environment')=='maintrack-production-approval',approval.get('reviewer')=='m-as23',type(approval.get('runId')) is int and approval.get('runId',0)>0,approval.get('sourceCommit')==commit,approval.get('artifactSha256')==artifact,approval.get('approved') is True)):
        reasons.append('VERIFIED_PLATFORM_APPROVAL_REQUIRED')
    readiness=record.get('findingReadiness',{})
    if not isinstance(readiness,dict):readiness={}
    for number in range(1,6):
        finding=f'MT-SEC-{number:03d}'
        if readiness.get(finding)!='PASS':reasons.append(finding+':NOT_RELEASE_READY')
    if not candidate_build_proven(root,record,commit,native_client_sha256):reasons.append('SECURITY_RC_BUILD_PROVENANCE_REQUIRED')
    if not re.fullmatch(r'[a-f0-9]{40}',commit):reasons.append('INVALID_SOURCE_COMMIT')
    if record.get('schema')!=1:reasons.append('INVALID_EVIDENCE_SCHEMA')
    if record.get('sourceCommit')!=commit:reasons.append('SOURCE_MISMATCH')
    if not artifact or record.get('artifactSha256')!=artifact:reasons.append('APK_MISMATCH_OR_MISSING')
    if record.get('productionSourceProven') is not True:reasons.append('OPERATIONAL_SOURCE_UNPROVEN')
    if record.get('independentApproval') is not True:reasons.append('INDEPENDENT_RELEASE_APPROVAL_REQUIRED')
    findings=record.get('findings')
    if not isinstance(findings,list):reasons.append('FINDINGS_REVIEW_MISSING')
    else:
        for finding in findings:
            if not isinstance(finding,dict) or not isinstance(finding.get('severity'),str):reasons.append('INVALID_FINDING_SEVERITY');continue
            severity=finding['severity'].strip().lower()
            if severity not in ('critical','high','medium','low','informational','info'):reasons.append('INVALID_FINDING_SEVERITY')
            elif severity in ('critical','high') and finding.get('resolved') is not True:reasons.append('UNRESOLVED_CRITICAL_HIGH')
    cases=record.get('cases',{});cases=cases if isinstance(cases,dict) else {}
    for case_id in REQUIRED:
        case=cases.get(case_id,{})
        if case.get('status')!='PASS':reasons.append(case_id+':'+str(case.get('status','NOT TESTED')));continue
        if case.get('sourceCommit')!=commit or case.get('artifactSha256')!=artifact:reasons.append(case_id+':STALE_BINDING')
        evidence=case.get('evidence',[])
        if not evidence:reasons.append(case_id+':MISSING_EVIDENCE')
        if case_id=='qa-cleanup' and not cleanup_proven(root,evidence,commit,artifact):reasons.append('qa-cleanup:SERVER_RECOVERY_AND_DEADLINE_UNPROVEN')
        for entry in evidence:
            try:
                relative=pathlib.Path(entry['path']);file=(root/relative).resolve()
                if relative.is_absolute() or not file.is_relative_to(root):raise ValueError('OUTSIDE_ROOT')
                if sha(file.read_bytes())!=entry.get('sha256'):raise ValueError('EVIDENCE_CHANGED')
            except (KeyError,ValueError,OSError,TypeError):reasons.append(case_id+':INVALID_EVIDENCE')
    return {'releaseDecision':'NO-GO' if reasons else 'GO','reasons':reasons,'deploymentAuthorized':False,'sourceCommit':commit,'artifactSha256':artifact,'requiredCases':list(REQUIRED)}
def main():
    p=argparse.ArgumentParser();p.add_argument('--evidence',required=True);p.add_argument('--artifact',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    root=pathlib.Path(__file__).resolve().parents[1]
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
    dirty=source_dirty(root)
    evidence=pathlib.Path(a.evidence);record=json.loads(evidence.read_text()) if evidence.exists() else {}
    apk=pathlib.Path(a.artifact);result=evaluate(root,record,commit,sha(apk.read_bytes()) if apk.is_file() else None)
    if dirty:result['reasons'].append('UNCOMMITTED_SOURCE_CHANGES');result['releaseDecision']='NO-GO'
    output=pathlib.Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result));return int(result['releaseDecision']!='GO')
if __name__=='__main__':raise SystemExit(main())
