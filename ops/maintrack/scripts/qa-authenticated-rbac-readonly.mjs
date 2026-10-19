// MainTrack authenticated RBAC probe — read-only, explicit QA opt-in only.
// No login, password handling, user creation, approvals, report writes or deploy.
// Requires three dedicated QA_RBAC_* accounts and their already-issued tokens.
// Never prints response bodies, names, codes, credentials or tokens.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export const STAGING_PROJECT_REF='tdnkeskczcsukcujwinu';
export const QA_API='https://'+STAGING_PROJECT_REF+'.supabase.co/functions/v1/maintrack-unified-four-qa/api';
export const OPT_IN='APPROVED_QA_RBAC_READ_ONLY';
const roles=['owner','engineer','technician'];
const allowed={
  session:{},
  profile:{},
  adminCatalog:{kind:'sections'},
  adminUsers:{},
  leaveInbox:{},
  overtimeInbox:{},
  cmms:{mode:'machines'}
};
const privileged=['adminCatalog','adminUsers','leaveInbox','overtimeInbox','cmms'];
const codeFor=role=>'QA_RBAC_'+role.toUpperCase();

export function configFromEnv(env){
  assert.equal(env.MAINTRACK_RBAC_QA_PROJECT_REF,STAGING_PROJECT_REF,
    'QA_PROJECT_NOT_ALLOWLISTED');
  assert.equal(env.MAINTRACK_RBAC_QA_CONFIRMATION,OPT_IN,
    'OWNER_QA_APPROVAL_MISSING');
  const tokens=Object.fromEntries(roles.map(role=>{
    const token=env['MAINTRACK_RBAC_QA_'+role.toUpperCase()+'_TOKEN'];
    assert.ok(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),
      'QA_TOKEN_UNAVAILABLE_OR_INVALID_'+role.toUpperCase());
    return [role,token];
  }));
  assert.equal(new Set(Object.values(tokens)).size,3,'QA_TOKENS_MUST_BE_DISTINCT');
  return {url:QA_API,tokens};
}

export async function runReadOnlyRbac(config,{request=fetch}={}){
  assert.equal(config.url,QA_API,'QA_URL_NOT_ALLOWLISTED');
  const tokens=config.tokens;
  assert.ok(tokens&&roles.every(role=>/^[a-f0-9]{64}$/.test(tokens[role]||'')),
    'MISSING_QA_TOKENS');
  assert.equal(new Set(roles.map(role=>tokens[role])).size,3,'QA_TOKENS_MUST_BE_DISTINCT');
  let checks=0;
  async function call(role,action){
    assert.ok(Object.hasOwn(allowed,action),'MUTATING_OR_UNKNOWN_ACTION_DENIED');
    const body=JSON.stringify({action,...allowed[action]});
    const response=await request(QA_API,{
      method:'POST',
      redirect:'error',
      signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},
      body
    });
    // Parse only for validation; never print or return body.
    let result;
    try{result=await response.json();}
    catch{throw Error('QA_NON_JSON_RESPONSE_'+action);}
    checks++;
    return {status:response.status,result};
  }
  // Validate every role and the EXACT synthetic identity before any privileged probes.
  for(const role of roles){
    const session=await call(role,'session');
    assert.equal(session.status,200,'QA_SESSION_FAILED_'+role);
    assert.equal(session.result.role,role,'QA_SESSION_ROLE_MISMATCH_'+role);
    const profile=await call(role,'profile');
    assert.equal(profile.status,200,'QA_PROFILE_FAILED_'+role);
    assert.equal(profile.result?.profile?.code,codeFor(role),'NON_QA_IDENTITY_BLOCKED_'+role);
    assert.equal(profile.result?.profile?.role,role,'QA_PROFILE_ROLE_MISMATCH_'+role);
  }
  // All calls below are SELECT-only in the reviewed Staging API.
  // Non-owner must fail before reading privileged data (no write probes used).
  for(const role of ['technician','engineer']){
    for(const action of privileged){
      const result=await call(role,action);
      assert.equal(result.status,403,'RBAC_EXPECTED_403_'+role+'_'+action);
      assert.equal(result.result?.error,'FORBIDDEN','RBAC_EXPECTED_FORBIDDEN_'+role+'_'+action);
    }
  }
  // Owner's positive proof is limited to catalog and machine metadata reads.
  for(const action of ['adminCatalog','cmms']){
    const result=await call('owner',action);
    assert.equal(result.status,200,'OWNER_READ_ONLY_ACCESS_'+action);
    assert.ok(Array.isArray(result.result?.items),'OWNER_READ_ONLY_SHAPE_'+action);
  }
  return Object.freeze({status:'PASS',checks,roles:3,
    unauthorizedBlocks:privileged.length*2,ownerReadChecks:2,
    safeOnly:true,project:'MainTrack-Staging'});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]!=='--live')throw Error('NO_LIVE_EXECUTION: use --live only after dedicated QA accounts and owner approval');
  try{
    const report=await runReadOnlyRbac(configFromEnv(process.env));
    console.log('MAINTRACK_AUTHENTICATED_RBAC_READ_ONLY_PASS '+JSON.stringify(report));
  }catch{
    // Deliberately suppress any nested exception details that might contain response data.
    console.error('MAINTRACK_AUTHENTICATED_RBAC_READ_ONLY_FAIL (details redacted)');
    process.exitCode=1;
  }
}
