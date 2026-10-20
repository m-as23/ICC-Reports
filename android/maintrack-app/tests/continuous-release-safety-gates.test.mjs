import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
const gates=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/qa/continuous-safety-release-gates.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.join(root,'ops/maintrack/employee-release-gates.json'),'utf8'));
test('full launch needs independently verified encrypted REAL Staging backup',()=>{
 const g=gates.gates.find(x=>x.id==='real-staging-backup-encrypted-offsite');
 assert.ok(g);
 assert.notEqual(g.status,'PASS');
 assert.equal(gates.candidate.releaseApproved,false);
 assert.equal(gates.operatingModel,'ALL_USERS_AT_ONCE_NO_SMALL_COHORT');
});
test('actual 30-user synthetic CRUD load gate is not implied by read-only uptime checks',()=>{
 assert.deepEqual(gates.acceptanceThresholdsProposed.syntheticConcurrentBusinessUsers,[5,10,20,30]);
 assert.equal(gates.gates.find(x=>x.id==='synthetic-business-load-30-users').status,'NOT_VERIFIED');
 assert.equal(gates.criticalRules.doNotInterpretHealthAsLoadTest,true);
});
test('observability is not live until workflow and alerting are activated',()=>{
 assert.equal(gates.gates.find(x=>x.id==='always-on-observability').status,'PREPARED_NOT_ACTIVE');
 assert.equal(gates.criticalRules.freezeRolloutIfAnyGateFails,true);
});
test('no release waiver, Staging employee mutation, signing or QA-to-Production promotion',()=>{
 assert.ok(Object.values(gates.criticalRules).every(x=>x===true));
 assert.equal(gates.environment.newSupabaseProjectRequired,false);
 assert.equal(old.state,'PRELAUNCH_BLOCKED');
 assert.equal(old.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
 assert.ok(old.mandatoryGates.every(x=>x.status==='pending'));
});
