// Picked up by the existing immutable CI Node test glob, without editing workflows.
// Imported release-gate tests never deploy or sign anything.
import '../../../ops/maintrack/tests/recovery-and-rollback-gates.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const backup=read('ops/maintrack/fixtures/isolated-qa-synthetic-export-20261020.json');
const contract=read('ops/maintrack/production-api-contract.json');

test('off-project QA fixture has 19 operational tables and every row is synthetic',()=>{
 assert.equal(backup.schema,'maintrack-synthetic-operational-export-v1');
 assert.equal(backup.source,'isolated-qa-full-only');
 assert.equal(Object.keys(backup.tables).length,19);
 assert.equal(Object.values(backup.tables).reduce((sum,rows)=>sum+rows.length,0),35);
 assert.equal(backup.tables.mt_users.length,3);
 assert.ok(backup.tables.mt_users.every(u=>u.employee_code.startsWith('QA_E2E_')&&!u.active));
 assert.equal(backup.tables.mt_reports.length,1);
 assert.ok(backup.tables.mt_reports.every(r=>r.description?.startsWith('Synthetic E2E')));
});
test('no passwords, bearer tokens, mail recipients, sessions or real employee details are exported',()=>{
 const full=JSON.stringify(backup.tables);
 for(const key of ['password_hash','token_hash','recipient_email','sender_email',
                   '"phone"','"preferred_name"','"mt_sessions"','"mt_mail_config"',
                   '"mt_login_attempts"','"mt_login_rate_guard"'])
   assert.ok(!full.includes(key), 'QA_FIXTURE_EXPOSES_REDACTED_FIELD:'+key);
 assert.equal(backup.sequences.length,8);
 assert.ok(backup.sequences.every(x=>/^mt_[a-z_]+$/.test(x.name)&&
   Number.isSafeInteger(x.last_value)&&x.last_value>=1));
});
test('32-action release candidate remains strictly NO-GO until a separate production backend exists',()=>{
 assert.equal(contract.requiredActions.length,32);
 assert.equal(new Set(contract.requiredActions).size,32);
 assert.equal(contract.webSource.productionReady,false);
 assert.equal(contract.state,'PRELAUNCH_NO_PRODUCTION_API');
 assert.equal(contract.liveSourceAudit.legacyFunction.verifiedCount,26);
 assert.equal(contract.liveSourceAudit.qaFunction.verifiedCount,32);
});
