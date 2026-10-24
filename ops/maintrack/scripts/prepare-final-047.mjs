// Final distribution derived from the accepted 047 source; never edits canonical assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {prepare047,verify047Parity} from './prepare-047-owner-preview.mjs';
import {inventory} from './prepare-native-405-qa.mjs';
import {sha256,QA_API} from './prepare-qa-api-client.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
export const defaultTarget=path.join(root,'audit-output/final-047');
const finalApi=QA_API.replace('maintrack-unified-four-qa','maintrack-final-047');
const oldInventory='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa';
const finalInventory=oldInventory.replace('maintrack-inventory-047-qa','maintrack-inventory-final-047');
function transform(rel,bytes){
 let s=bytes.toString('utf8');
 if(rel==='secure-assets/index-inline-1.js'){
  assert.equal(s.split(QA_API).length-1,1,'FINAL_SINGLE_API_REQUIRED');s=s.replace(QA_API,finalApi);
 }else if(rel==='inventory-047.js'){
  assert.equal(s.split(oldInventory).length-1,1,'FINAL_SINGLE_INVENTORY_API_REQUIRED');
  // The client also pins the exact allowed endpoint in a regex; update both pins.
  assert.equal(s.split('maintrack-inventory-047-qa').length-1,2,'FINAL_INVENTORY_ENDPOINT_PINS_REQUIRED');
  s=s.replaceAll('maintrack-inventory-047-qa','maintrack-inventory-final-047');
 }else if(rel==='index.html'){
  assert.equal(s.split('MainTrack 0.4.7 — Owner Preview').length-1,1,'FINAL_TITLE_REQUIRED');s=s.replace('MainTrack 0.4.7 — Owner Preview','MainTrack 0.4.7 Final');
 }else if(rel==='manifest.webmanifest'){
  const m=JSON.parse(s);assert.equal(m.name,'MainTrack 0.4.7 — Owner Preview');m.name='MainTrack 0.4.7 Final';s=JSON.stringify(m)+'\n';
 }else return bytes;
 return Buffer.from(s);
}
export async function prepareFinal047({target=defaultTarget}={}){
 assert.ok(path.resolve(target).startsWith(path.join(root,'audit-output')+path.sep),'FINAL_OUTPUT_MUST_BE_ISOLATED');
 await assert.rejects(fs.stat(target),{code:'ENOENT'},'FINAL_OUTPUT_ALREADY_EXISTS');
 await fs.mkdir(target,{recursive:true});
 const base=path.join(target,'accepted-base');
 const original=await prepare047({target:base});
 for(const folder of ['web','native/www']){
  await fs.cp(path.join(base,folder),path.join(target,folder),{recursive:true});
  for(const rel of await inventory(path.join(base,folder)))await fs.writeFile(path.join(target,folder,rel),transform(rel,await fs.readFile(path.join(base,folder,rel))));
 }
 const sharedAssets=[];
 for(const rel of original.sharedAssets.map(x=>x.path))sharedAssets.push({path:rel,sha256:sha256(await fs.readFile(path.join(target,'web',rel)))});
 const report={...original,channel:'FINAL_047',backend:'maintrack-final-047',inventoryBackend:'maintrack-inventory-final-047',cutoverExecuted:false,sharedAssets};
 await fs.writeFile(path.join(target,'provenance.json'),JSON.stringify(report,null,2)+'\n');
 return verifyFinal047(target);
}
export async function verifyFinal047(target=defaultTarget){
 const base=path.join(target,'accepted-base');const original=await verify047Parity(base);
 const report=JSON.parse(await fs.readFile(path.join(target,'provenance.json'),'utf8'));
 assert.equal(report.channel,'FINAL_047');assert.equal(report.sourceCommit,original.sourceCommit);
 assert.equal(report.appId,original.appId);assert.equal(report.versionCode,407);assert.equal(report.versionName,'0.4.7');
 assert.equal(report.certificateSha256,original.certificateSha256);assert.equal(report.cutoverExecuted,false);
 assert.equal(report.employeeRollout,false);assert.equal(report.otaPublished,false);
 assert.equal(report.backend,'maintrack-final-047');assert.equal(report.inventoryBackend,'maintrack-inventory-final-047');
 assert.deepEqual(report.generated,original.generated);
 assert.deepEqual(report.sharedAssets.map(x=>x.path),original.sharedAssets.map(x=>x.path));
 for(const folder of ['web','native/www']){
  assert.deepEqual(await inventory(path.join(target,folder)),await inventory(path.join(base,folder)),'FINAL_FILE_LIST_MISMATCH');
  for(const rel of await inventory(path.join(base,folder))){
   const expected=transform(rel,await fs.readFile(path.join(base,folder,rel)));
   assert.deepEqual(await fs.readFile(path.join(target,folder,rel)),expected,'FINAL_ASSET_MISMATCH: '+folder+'/'+rel);
   if(folder==='web')assert.equal(report.sharedAssets.find(x=>x.path===rel).sha256,sha256(expected),'FINAL_MANIFEST_MISMATCH');
  }
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=process.argv[2]==='--verify'?await verifyFinal047():await prepareFinal047();
 console.log('PASS Final 047 Web/native parity, accepted source and dedicated service routes',JSON.stringify({source:r.sourceCommit,assets:r.sharedAssets.length,cutoverExecuted:false}));
}
