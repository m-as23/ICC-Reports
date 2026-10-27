"""Offline, fail-closed release evidence gate. Never authorizes deployment by itself."""
import argparse,hashlib,json,pathlib,re,subprocess
REQUIRED=('logout-core-401','logout-inventory-401','other-session-survives','unauthorized-access','owner-permissions','engineer-permissions','technician-permissions','inventory-authenticated-writes','ep001-authenticated-shell','android-integrated-runtime','ota-operational-parity','qa-production-diff-reviewed','qa-cleanup')
def sha(data):return hashlib.sha256(data).hexdigest()
def source_dirty(root):
    return bool(subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=root,text=True).strip())
def evaluate(root,record,commit,artifact):
    root=pathlib.Path(root).resolve();reasons=[]
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
