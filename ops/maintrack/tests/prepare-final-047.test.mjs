import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {prepareFinal047,verifyFinal047} from '../scripts/prepare-final-047.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
test('Final 047 derives identical reviewed Web/native assets with final routes and rejects tampering',async()=>{
 const temp=await fs.mkdtemp(path.join(root,'audit-output/final047-test-'));
 const target=path.join(temp,'candidate');
 try{
  const report=await prepareFinal047({target});
  assert.equal(report.channel,'FINAL_047');assert.equal(report.appId,'com.icc.maintrack');
  assert.equal(report.versionCode,407);assert.equal(report.cutoverExecuted,false);
  const web=await fs.readFile(path.join(target,'web/secure-assets/index-inline-1.js'),'utf8');
  assert.ok(web.includes('/maintrack-final-047/api'));assert.ok(!web.includes('/maintrack-unified-four-qa/api'));
  const inv=await fs.readFile(path.join(target,'web/inventory-047.js'),'utf8');
  assert.ok(inv.includes('/maintrack-inventory-final-047'));assert.ok(!inv.includes('/maintrack-inventory-047-qa'));
  assert.ok(inv.includes('"tdnkeskczcsukcujwinu:final047:"'));assert.ok(!inv.includes('"tdnkeskczcsukcujwinu:"'));
  assert.match(await fs.readFile(path.join(target,'web/index.html'),'utf8'),/MainTrack 0.4.7 Final/);
  for(const rel of ['inventory-047.js','team-ledger.js','secure-assets/index-inline-1.js'])assert.deepEqual(await fs.readFile(path.join(target,'web',rel)),await fs.readFile(path.join(target,'native/www',rel)));
  await verifyFinal047(target);
  await fs.appendFile(path.join(target,'native/www/inventory-047.js'),'/*tamper*/');
  await assert.rejects(verifyFinal047(target),/FINAL_ASSET_MISMATCH/);
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
