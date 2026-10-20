// Offline release-readiness checks, never publish, sign, or contact QA/Production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {stageVerifiedBundle,simulatedRollback,canActivate}
  from '../../../android/maintrack-app/update-system/ota-lab.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const config=JSON.parse(read('ops/maintrack/production-api-contract.json'));
const gates=JSON.parse(read('ops/maintrack/employee-release-gates.json'));
const web=read(config.webSource.path);
const ddl=read('ops/maintrack/qa-full-schema-only.sql');

test('versioned QA reconstruction can create 23 RLS-protected tables with no release credentials',()=>{
 assert.equal([...ddl.matchAll(/CREATE TABLE qa_full\.mt_[a-z_]+/g)].length,23);
 assert.equal([...ddl.matchAll(/ALTER TABLE qa_full\.mt_[a-z_]+ ENABLE ROW LEVEL SECURITY/g)].length,23);
 assert.equal([...ddl.matchAll(/CREATE TRIGGER mt_[a-z_]+/g)].length,3);
 assert.equal([...ddl.matchAll(/CREATE OR REPLACE FUNCTION qa_full\.mt_[a-z_]+/g)].length,3);
 assert.match(ddl,/CREATE VIEW qa_full\.mt_reports_sheet_view WITH \(security_invoker = true\)/);
 assert.match(ddl,/REVOKE ALL ON SCHEMA qa_full FROM PUBLIC,anon,authenticated/);
 assert.ok(!ddl.includes('qa_restore'),'The checked-in baseline must remain standalone');
});

test('offline local work blocks OTA download and activation without writing queue',async()=>{
 let calls=0;
 const updater={
   download:async()=>{calls++;return {id:'untrusted-synthetic-candidate'};},
   next:async()=>{calls++;}
 };
 const local={dirtyForm:true,unsentReports:1,submitting:false,offline:false,unknownQueue:false};
 assert.equal(canActivate(local),false);
 const res=await stageVerifiedBundle({
   verifiedRelease:{bundleUrl:'https://updates-lab.example/fixture.zip',
     bundleVersion:'9.0.0',sha256:'a'.repeat(64)},updater,
   getLocalState:()=>({...local})
 });
 assert.equal(res.status,'deferred');
 assert.equal(calls,0);
 assert.equal(local.unsentReports,1);
});

test('failed OTA download never schedules next bundle; rollback mock resets only on failed bootstrap',async()=>{
 let next=0,reset=0;
 const updater={
  download:async()=>{throw Error('NETWORK_DOWN');},
  next:async()=>{next++;},
  reset:async()=>{reset++;}
 };
 const state={dirtyForm:false,unsentReports:0,submitting:false,offline:false,unknownQueue:false};
 const r=await stageVerifiedBundle({
  verifiedRelease:{bundleUrl:'https://updates-lab.example/candidate.zip',bundleVersion:'9.0.0',
   sha256:'a'.repeat(64)},
  updater,getLocalState:()=>state
 });
 assert.equal(r.status,'failed');
 assert.equal(next,0);
 assert.equal(await simulatedRollback({updater,bootstrapCompleted:false}),'reverted');
 assert.equal(reset,1);
 assert.equal(await simulatedRollback({updater,bootstrapCompleted:true}),'kept');
 assert.equal(reset,1);
});

test('canonical Web remains release-blocked until its legacy 26-action endpoint is replaced',()=>{
 assert.equal(config.requiredActions.length,32);
 assert.equal(config.liveSourceAudit.legacyFunction.verifiedCount,26);
 assert.equal(config.liveSourceAudit.qaFunction.verifiedCount,32);
 assert.ok(web.includes('/maintrack-stage9-security-api/api'));
 assert.ok(!config.webSource.productionReady);
 assert.equal(config.state,'PRELAUNCH_NO_PRODUCTION_API');
});

test('existing Android signing identity and Production NO-GO cannot be bypassed by QA',()=>{
 assert.equal(gates.state,'PRELAUNCH_BLOCKED');
 assert.equal(gates.currentBaseline.appId,'com.icc.maintrack');
 assert.match(gates.currentBaseline.installedAndroidCertificateSha256,/^[0-9a-f]{64}$/);
 assert.equal(gates.approvedArchitecture.productionWebDeploymentAllowed,false);
 assert.equal(gates.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
 assert.equal(gates.employeeRollout,'DENY_UNTIL_ALL_GATES_INDEPENDENTLY_VERIFIED');
 assert.equal(gates.mandatoryGates.length,10);
 assert.ok(gates.mandatoryGates.every(x=>x.status==='pending'));
});
