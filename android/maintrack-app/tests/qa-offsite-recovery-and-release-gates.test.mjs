// Picked up by the existing immutable CI Node test glob, without editing workflows.
// Imported release-gate tests never deploy or sign anything.
import '../../../ops/maintrack/tests/recovery-and-rollback-gates.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
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
   (x.last_value===null || Number.isSafeInteger(x.last_value)&&x.last_value>=1)));
});
test('32-action release candidate remains strictly NO-GO until a separate production backend exists',()=>{
 assert.equal(contract.requiredActions.length,32);
 assert.equal(new Set(contract.requiredActions).size,32);
 assert.equal(contract.webSource.productionReady,false);
 assert.equal(contract.state,'PRELAUNCH_NO_PRODUCTION_API');
 assert.equal(contract.liveSourceAudit.legacyFunction.verifiedCount,26);
 assert.equal(contract.liveSourceAudit.qaFunction.verifiedCount,32);
});

test('Android preflight parser is tested without installing or reading a physical device',()=>{
 const py=path.join(root,'ops/maintrack/scripts/owner-device-qa-preflight.py');
 const check=spawnSync('python3',[py,'--self-test'],{encoding:'utf8',timeout:10000});
 assert.equal(check.status,0,check.stderr);
 const j=JSON.parse(check.stdout);
 assert.equal(j.result,'PASS_PARSER_ONLY');
 assert.equal(j.deviceAccess,false);
 assert.equal(j.apkSignatureChecked,false);
 const noApk=spawnSync('python3',[py],{encoding:'utf8',timeout:10000});
 assert.equal(noApk.status,2,'No unverified APK may be accepted');
});
