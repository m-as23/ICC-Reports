"""One report per bounded invocation; QA/Android are never started implicitly."""
import argparse,datetime,json,pathlib,sys,uuid,subprocess
from release_gate import evaluate,source_dirty
from engine import fingerprint,valid_reuse,release_decision,select_impacted,execute_bounded,digest
ROOT=pathlib.Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--mode',choices=['local','release'],default='local');p.add_argument('--changed',action='append',default=[]);p.add_argument('--artifact');p.add_argument('--release-evidence');p.add_argument('--output');a=p.parse_args()
 cases=json.loads((ROOT/'security-regression/catalog.json').read_text())['cases'];cache_path=ROOT/'security-regression/cache.json';cache=json.loads(cache_path.read_text()) if cache_path.exists() else {};results=[]
 impacted=select_impacted(cases,a.changed) if a.changed else {c['id'] for c in cases};subject=digest(pathlib.Path(a.artifact).read_bytes()) if a.artifact else 'local-components'
 registry_path=ROOT/'security-regression/runtime-evidence.json';registry=json.loads(registry_path.read_text()) if registry_path.exists() else {}
 for case in cases:
  definition=digest(json.dumps(case,sort_keys=True));record={'id':case['id'],'required':case['required'],'mode':case['mode'],'impacted':case['id'] in impacted}
  old=cache.get(case['id'],{});case_subject='local-components' if case['mode']=='local' else subject
  if not (a.changed and case['id'] in impacted) and valid_reuse(ROOT,old,case['inputs'],case_subject,definition):record.update(status='PASS',execution='REUSED',evidence=old['evidence'])
  elif case['mode']=='local':
   cmd=[sys.executable if x=='{python}' else x for x in case['command']];r=execute_bounded(cmd,ROOT,case['timeout']);record.update(r,execution='EXECUTED')
   evidence_dir=ROOT/'security-regression/evidence';evidence_dir.mkdir(exist_ok=True);ev=evidence_dir/(case['id']+'.txt');ev.write_text(r['output'],encoding='utf-8')
   cache[case['id']]={**record,'inputs':fingerprint(ROOT,case['inputs']),'evidence':fingerprint(ROOT,[ev.relative_to(ROOT).as_posix()]),'definition':definition,'subject':case_subject}
  else:
   att=registry.get(case['id'],{});checked={**att,'status':'PASS'}
   if att.get('status') in ('PASS','FAIL') and not (a.changed and case['id'] in impacted) and valid_reuse(ROOT,checked,case['inputs'],subject,definition):record.update(status=att['status'],execution='IMPORTED_ARTIFACT_BOUND',evidence=att['evidence'],scope=att.get('scope','QA_ONLY'))
   else:record.update(status='NOT TESTED',execution='REQUIRES_EXPLICIT_RUN',reason=case['reason'])
  results.append(record)
 strict={'releaseDecision':'NO-GO','reasons':['LOCAL_CI_CANNOT_AUTHORIZE_RELEASE'],'deploymentAuthorized':False}
 if a.mode=='release':
  commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
  record=json.loads(pathlib.Path(a.release_evidence).read_text()) if a.release_evidence else {}
  strict=evaluate(ROOT,record,commit,subject if a.artifact else None)
  if source_dirty(ROOT):strict['reasons'].append('UNCOMMITTED_SOURCE_CHANGES');strict['releaseDecision']='NO-GO'
 decision='GO' if release_decision(results)=='GO' and strict['releaseDecision']=='GO' else 'NO-GO'
 report={'schema':1,'runId':uuid.uuid4().hex,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':a.mode,'subject':subject,'results':results,'localCheck':'PASS' if all(x['status']=='PASS' for x in results if x['mode']=='local') else 'FAIL','releaseDecision':decision,'releaseGate':strict,'cloudOpened':False,'scheduled':False}
 output=pathlib.Path(a.output) if a.output else ROOT/'security-regression/reports'/('run-'+report['runId']+'.json');output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');cache_path.write_text(json.dumps(cache,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'report':str(output),'localCheck':report['localCheck'],'releaseDecision':report['releaseDecision'],'cloudOpened':False}))
 return int(report['localCheck']!='PASS' or (a.mode=='release' and report['releaseDecision']!='GO'))
if __name__=='__main__':raise SystemExit(main())
