import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preparePermanentInventory} from '../scripts/prepare-permanent-inventory.mjs';
const snapshot=process.env.MAINTRACK_QA_INVENTORY_SNAPSHOT;
test('unrecognized snapshot is rejected before preparing any deployment package',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mt-inventory-package-'));
 try{fs.writeFileSync(path.join(dir,'index.ts'),'not the attested QA source');assert.throws(()=>preparePermanentInventory(dir),/V9_SNAPSHOT_MISMATCH/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('exact attested v9 produces portable canonical Inventory with closed write and Storage boundaries',()=>{
 assert.ok(snapshot,'MAINTRACK_QA_INVENTORY_SNAPSHOT must name the independently verified v9 snapshot; absent is not PASS');
 const lockPath=process.env.MAINTRACK_QA_INVENTORY_LOCK;assert.ok(lockPath,'Explicit reviewed Deno lock required');
 assert.throws(()=>preparePermanentInventory(snapshot,'{}'),/REVIEWED_RUNTIME_LOCK_REQUIRED/);
 const p=preparePermanentInventory(snapshot,fs.readFileSync(lockPath,'utf8')),get=n=>p.files.find(x=>x.name===n)?.content;
 assert.equal(p.deploy,false);assert.equal(p.writesEnabled,false);assert.equal(p.baselineVersion,9);
 assert.equal(p.projectRef,'szhstrafzkxzstjdcynl');assert.equal(p.baselineFiles.length,4);assert.ok(p.canonical.length>=15);
 const c=JSON.parse(get('deno.json'));assert.equal(c.imports.yauzl,'npm:yauzl@3.2.1');assert.equal(c.imports.exceljs,'npm:exceljs@4.4.0');assert.ok(c.unstable.includes('detect-cjs'));
 assert.equal(c.lock.frozen,true);assert.equal(c.nodeModulesDir,'none');assert.equal(JSON.parse(get('deno.lock')).version,'5');
 assert.match(get('inventory-guard.mjs'),/ssl:\{rejectUnauthorized:true\}/);assert.match(get('inventory-guard.mjs'),/x\.accounts===2/);
 assert.match(get('backend/postgres-store.mjs'),/qa_security_inventory_20261025\.upload_intents/);
 assert.match(get('backend/maintrack-session-adapter.mjs'),/qa_security_final_20261025\.mt_sessions/);
 assert.match(get('index.ts'),/method:'GET',redirect:'error'/);assert.match(get('index.ts'),/upload:denied,remove:denied,download:denied/);
 assert.match(get('index.ts'),/QA_INVENTORY_WRITES_DISABLED/);assert.match(get('index.ts'),/length>65536/);
 assert.match(get('index.ts'),/Deno\.serve\(channel\.wrap\(withQaIsolation\(handler/);
 for(const f of p.files){assert.equal(createHash('sha256').update(f.content).digest('hex'),p.sha256[f.name]);assert.doesNotMatch(f.content,/file:\/\/\/|[A-Z]:[\\/]|pg-loopback|exceljs-shim|yauzl-shim/);}
});
