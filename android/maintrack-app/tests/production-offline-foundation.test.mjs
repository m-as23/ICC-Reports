// Staged Production foundation acceptance; executed by existing Android Node CI glob.
// Deliberately offline: NO SUPABASE_DB_URL, no GitHub write, no deploy or APK publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareProductionLocked,gitBlob,PINNED_GIT_BLOB} from '../../../ops/maintrack/production/prepare-locked-api.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
const contract=JSON.parse(load('ops/maintrack/production-api-contract.json'));
const source=load('supabase/functions/maintrack-stage9-security-api/index.ts');
const ddl=load('ops/maintrack/production/001-private-schema-LOCKED.sql');
const gates=JSON.parse(load('ops/maintrack/employee-release-gates.json'));

test('Production DDL is zero-data, private and RLS protected for all 23 tables',()=>{
 assert.equal([...ddl.matchAll(/CREATE TABLE mt_prod\."mt_[a-z_]+"/g)].length,23);
 assert.equal([...ddl.matchAll(/ALTER TABLE mt_prod\."mt_[a-z_]+" ENABLE ROW LEVEL SECURITY/g)].length,23);
 assert.match(ddl,/CREATE SCHEMA mt_prod/);
 assert.match(ddl,/REVOKE ALL ON SCHEMA mt_prod FROM PUBLIC,anon,authenticated/);
 assert.match(ddl,/security_invoker = true/);
 assert.match(ddl,/ALTER DEFAULT PRIVILEGES IN SCHEMA mt_prod REVOKE EXECUTE ON FUNCTIONS/);
 assert.ok(!/^INSERT INTO /m.test(ddl),'Only trigger code may contain internal inserts');
 assert.ok(!ddl.includes('qa_full')&&!ddl.includes('qa_restore'));
 assert.ok(!ddl.includes('tdnkeskczcsukcujwinu')&&!ddl.includes('szhstrafzkxzstjdcynl'));
});
test('Frozen candidate has all 32 actions and a permanent Owner-release lock',()=>{
 const {source:locked,report}=prepareProductionLocked(source,contract.requiredActions);
 assert.equal(gitBlob(source),PINNED_GIT_BLOB);
 assert.equal(report.actions,32);
 assert.equal(report.state,'NO_GO_PRODUCTION_LOCKED');
 assert.equal(report.ownerReleaseAuthorized,false);
 assert.equal(report.deploy,false);
 assert.equal(report.webDeploy,false);
 assert.equal(report.signing,false);
 assert.match(locked,/const MAINTRACK_PRODUCTION_OWNER_RELEASE_AUTHORIZED=false;/);
 assert.match(locked,/throw new Error\('MAINTRACK_PRODUCTION_RELEASE_LOCKED'\)/);
 assert.match(locked,/search_path=mt_prod,public,extensions/);
 assert.match(locked,/Deno\.env\.get\('MAINTRACK_PRODUCTION_PROJECT_REF'\)/);
 assert.match(locked,/Deno\.env\.get\('MAINTRACK_PRODUCTION_WEB_ORIGIN'\)/);
 assert.ok(!locked.includes('tdnkeskczcsukcujwinu.supabase.co'));
 assert.ok(!locked.includes('szhstrafzkxzstjdcynl.supabase.co'));
});
test('Any mutation of pinned API source fails closed before Production candidate generation',()=>{
 assert.throws(()=>prepareProductionLocked(source+'\n//unexpected',contract.requiredActions),
  /REVIEWED_BACKEND_SOURCE_CHANGED/);
 assert.throws(()=>prepareProductionLocked(source,contract.requiredActions.slice(0,26)),
  /EXPECTED_32_ACTIONS/);
 assert.throws(()=>prepareProductionLocked(source,[...contract.requiredActions.slice(0,31),'unknownApiAction']),
  /API_ACTION_PARITY_FAILURE/);
});
test('Production endpoint and employee release remain blocked before independent Owner approval',()=>{
 assert.equal(contract.state,'PRELAUNCH_NO_PRODUCTION_API');
 assert.equal(contract.webSource.productionReady,false);
 assert.equal(gates.state,'PRELAUNCH_BLOCKED');
 assert.equal(gates.approvedArchitecture.productionWebDeploymentAllowed,false);
 assert.equal(gates.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
 assert.equal(gates.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
 assert.equal(gates.mandatoryGates.length,10);
 assert.ok(gates.mandatoryGates.every(x=>x.status==='pending'));
});
