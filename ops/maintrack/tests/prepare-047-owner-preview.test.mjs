import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepare047,verify047Parity} from '../scripts/prepare-047-owner-preview.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
test('047 Web and native share every application asset; modified source and tampered output fail closed',async()=>{
 const folder=await fs.mkdtemp(path.join(root,'audit-output/owner-047-test-'));
 try{
  const source=path.join(folder,'source');
  await fs.cp(path.join(root,'web/maintrack/public'),source,{recursive:true});
  const target=path.join(folder,'build');
  const report=await prepare047({source,target});
  assert.equal(report.versionCode,407);
  assert.equal(report.versionName,'0.4.7');
  assert.equal(report.appId,'com.icc.maintrack');
  assert.equal(report.inventoryLive,false);
  assert.equal(report.employeeRollout,false);
  assert.ok(report.sharedAssets.length>=18);
  assert.equal((await verify047Parity(target)).sharedAssets.length,report.sharedAssets.length);
  const js=await fs.readFile(path.join(target,'web/secure-assets/index-inline-1.js'),'utf8');
  assert.ok(js.includes('maintrack-unified-four-qa/api'));
  assert.ok(!js.includes('maintrack-stage9-security-api/api'));
  assert.ok((await fs.readFile(path.join(target,'native/www/index.html'),'utf8')).includes('stage20-native-session.js'));
  await fs.appendFile(path.join(target,'native/www/v6.js'),'\n/* tampered */');
  await assert.rejects(verify047Parity(target),/ASSET_MISMATCH/);
  const webJs=path.join(target,'web/v6.js'),nativeJs=path.join(target,'native/www/v6.js');
  const original=await fs.readFile(webJs);
  const forged=Buffer.concat([original,Buffer.from('\n/* forged artifact plus matching manifest */')]);
  await fs.writeFile(webJs,forged);await fs.writeFile(nativeJs,forged);
  const provenancePath=path.join(target,'provenance.json');
  const provenance=JSON.parse(await fs.readFile(provenancePath,'utf8'));
  provenance.sharedAssets.find(x=>x.path==='v6.js').sha256=createHash('sha256').update(forged).digest('hex');
  await fs.writeFile(provenancePath,JSON.stringify(provenance));
  await assert.rejects(verify047Parity(target),/UNREVIEWED_SHARED_ASSET_HASH/);
  await fs.appendFile(path.join(source,'v6.js'),'\n/* unreviewed */');
  await assert.rejects(prepare047({source,target:path.join(folder,'rejected')}),/SOURCE_HASH_MISMATCH/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
