// No-cost two-project pilot must never silently bypass release locks.
// Picked up by existing "npm test" glob on the QA branch, no live API calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const policy=load('ops/maintrack/pilot/two-project-safe-pilot-policy.json');
const production=load('ops/maintrack/employee-release-gates.json');
test('two existing Supabase project references remain separate; no third required for QA',()=>{
 assert.equal(policy.state,'PREPARATION_ONLY_RELEASE_BLOCKED');
 assert.equal(policy.resources.currentApplication.ref,'tdnkeskczcsukcujwinu');
 assert.equal(policy.resources.isolatedQa.ref,'szhstrafzkxzstjdcynl');
 assert.equal(policy.resources.independentProduction.ref,null);
 assert.equal(policy.resources.independentProduction.state,'DEFERRED_UNAVAILABLE_ON_TWO_FREE_PROJECT_LIMIT');
 assert.notEqual(policy.resources.currentApplication.ref,policy.resources.isolatedQa.ref);
 assert.equal(policy.resources.noThirdProjectRequiredForCurrentQa,true);
 assert.equal(policy.resources.retainBothCurrentProjects,true);
});
test('limited pilot cannot write, publish, delete, merge or repurpose existing projects automatically',()=>{
 for(const [k,v] of Object.entries(policy.safety))
  assert.equal(v,false,'UNAUTHORIZED_SAFETY_EXCEPTION:'+k);
 assert.equal(policy.limitedPilotBeforeDeployment.state,'BLOCKED_PENDING_OWNER_APPROVAL');
 assert.equal(policy.limitedPilotBeforeDeployment.requirements.length,6);
 assert.ok(policy.limitedPilotBeforeDeployment.requirements.every(x=>x.status==='pending'));
});
test('existing 10-gate Production employee release remains strictly blocked',()=>{
 assert.equal(production.state,'PRELAUNCH_BLOCKED');
 assert.equal(production.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
 assert.equal(production.mandatoryGates.length,10);
 assert.ok(production.mandatoryGates.every(x=>x.status==='pending'));
 assert.equal(policy.existingEmployeeReleaseStateMustRemain,production.state);
 assert.equal(production.approvedArchitecture.productionWebDeploymentAllowed,false);
 assert.equal(production.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
});
