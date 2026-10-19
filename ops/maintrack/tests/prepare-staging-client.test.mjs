import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareStagingClient,reviewApiSubstitution} from '../scripts/prepare-staging-client.mjs';
import {checkFutureClientApiSource} from '../scripts/check-next-release-api-parity.mjs';
const OLD='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const QA='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';

test('exactly one approved URL is rewritten without modifying any other text',()=>{
 const src="const API='"+OLD+"';\nconst test=123;\n";
 assert.equal(reviewApiSubstitution(src),"const API='"+QA+"';\nconst test=123;\n");
});
test('duplicate legacy addresses, already rewritten source, and missing reference fail closed',()=>{
 assert.throws(()=>reviewApiSubstitution(OLD+'\n'+OLD),/REQUIRES_EXACTLY_ONE/);
 assert.throws(()=>reviewApiSubstitution(QA),/REQUIRES_EXACTLY_ONE/);
 assert.throws(()=>reviewApiSubstitution(OLD+'\n'+QA),/SOURCE_MUST_REMAIN_FROZEN/);
});
test('staging Web and Android reuse only transformed JS; original source remains identical',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'maintrack-qa-only-'));
 const source=path.join(temp,'source'),out=path.join(temp,'out');
 try{
  await fs.mkdir(path.join(source,'secure-assets'),{recursive:true});
  const src="const API='"+OLD+"';\n";
  const untouched='<html><body>MainTrack</body></html>';
  await fs.writeFile(path.join(source,'secure-assets/index-inline-1.js'),src);
  await fs.writeFile(path.join(source,'index.html'),untouched);
  await fs.writeFile(path.join(source,'static.css'),'.safe{display:block}');
  const report=await prepareStagingClient({source,destination:out});
  assert.equal(report.mode,'STAGING_ONLY_NO_PUBLISH');
  assert.equal(report.apiActions,32);
  assert.deepEqual(report.changed.map(x=>x.path),['secure-assets/index-inline-1.js']);
  assert.equal(await fs.readFile(path.join(source,'secure-assets/index-inline-1.js'),'utf8'),src);
  assert.equal(await fs.readFile(path.join(out,'secure-assets/index-inline-1.js'),'utf8'),src.replace(OLD,QA));
  assert.equal(await fs.readFile(path.join(out,'index.html'),'utf8'),untouched);
  assert.equal(await fs.readFile(path.join(out,'static.css'),'utf8'),'.safe{display:block}');
  assert.equal(checkFutureClientApiSource(await fs.readFile(path.join(out,'secure-assets/index-inline-1.js'),'utf8')).actions,32);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('untrusted symlink in source refuses to stage any release candidate',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'maintrack-qa-symlink-')),src=path.join(dir,'src');
 try{
  await fs.mkdir(path.join(src,'secure-assets'),{recursive:true});
  await fs.writeFile(path.join(src,'secure-assets/index-inline-1.js'),OLD);
  await fs.writeFile(path.join(src,'index.html'),'<html></html>');
  await fs.symlink('/etc/hosts',path.join(src,'bad'));
  await assert.rejects(prepareStagingClient({source:src,destination:path.join(dir,'out')}),/SYMLINK_ASSET_NOT_ALLOWED/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('source and output path cannot point to same location',async()=>{
 await assert.rejects(prepareStagingClient({source:'/tmp/maintrack',destination:'/tmp/maintrack'}),/REFUSE_MUTATE_SOURCE/);
});
