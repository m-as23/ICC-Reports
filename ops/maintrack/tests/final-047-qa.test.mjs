import test from 'node:test';import assert from 'node:assert/strict';
import {finalQAPasses,requiredFinalChecks} from '../scripts/check-final-047-qa.mjs';
test('Final signer requires latest independent Actions success for exact source SHA',()=>{
 const sha='a'.repeat(40);const checks=requiredFinalChecks.map((name,id)=>({id:id+1,name,head_sha:sha,status:'completed',conclusion:'success',app:{slug:'github-actions'}}));
 assert.equal(finalQAPasses(checks,sha),true);
 for(const extra of [{conclusion:'failure'},{status:'in_progress',conclusion:null}])assert.equal(finalQAPasses([...checks,{...checks[0],id:100,...extra}],sha),false);
 assert.equal(finalQAPasses(checks,'b'.repeat(40)),false);
 assert.equal(finalQAPasses(checks.map(c=>({...c,app:{slug:'other'}})),sha),false);
 assert.equal(finalQAPasses(checks.slice(1),sha),false);
});
