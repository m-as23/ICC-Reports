import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareQaBundle} from '../scripts/prepare-full-qa-bundle.mjs';
import {sourcePath,QA_API,OLD_API} from '../scripts/prepare-qa-api-client.mjs';

test('full QA Web/Android candidate changes only URL in approved JS and keeps other assets identical',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mt-staging-bundle-'));
 const from=path.join(folder,'from'),to=path.join(folder,'qa');
 try{
  await fs.mkdir(path.join(from,'secure-assets'),{recursive:true});
  const code=await fs.readFile(sourcePath,'utf8');
  await fs.writeFile(path.join(from,'secure-assets/index-inline-1.js'),code);
  await fs.writeFile(path.join(from,'index.html'),'<html><head></head><body>QA</body></html>');
  await fs.writeFile(path.join(from,'secure-assets/unchanged.css'),'body{color:#fff}');
  const report=await prepareQaBundle({from,to});
  assert.equal(report.files,3);
  assert.deepEqual(report.assetHashes.filter(a=>a.changed).map(a=>a.path),
    ['secure-assets/index-inline-1.js']);
  const changed=await fs.readFile(path.join(to,'secure-assets/index-inline-1.js'),'utf8');
  assert.equal(changed,code.replace(OLD_API,QA_API));
  assert.equal(await fs.readFile(path.join(from,'secure-assets/index-inline-1.js'),'utf8'),code);
  assert.equal(await fs.readFile(path.join(to,'secure-assets/unchanged.css'),'utf8'),'body{color:#fff}');
  assert.equal(report.employeeRelease,false);
  assert.equal(report.nativeApkBuilt,false);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});
test('refuse overwriting original source',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mt-same-'));
 try{await assert.rejects(prepareQaBundle({from:folder,to:folder}),/REFUSE_OVERWRITE_CANONICAL_SOURCE/)}
 finally{await fs.rm(folder,{recursive:true,force:true})}
});
test('refuse output nested inside source, protecting canonical assets',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mt-overlap-'));
 try{await assert.rejects(prepareQaBundle({from:folder,to:path.join(folder,'out')}),/REFUSE_OVERLAPPING_SOURCE_OUTPUT/)}
 finally{await fs.rm(folder,{recursive:true,force:true})}
});
test('refuse symlink before processing all assets',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mt-symlink-'));
 const from=path.join(folder,'source');
 try{
  await fs.mkdir(path.join(from,'secure-assets'),{recursive:true});
  await fs.writeFile(path.join(from,'index.html'),'x');
  await fs.writeFile(path.join(from,'secure-assets/index-inline-1.js'),await fs.readFile(sourcePath));
  await fs.symlink('/etc/hosts',path.join(from,'unsafe-link'));
  await assert.rejects(prepareQaBundle({from,to:path.join(folder,'output')}),/SYMLINK_ASSET_BLOCKED/);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});
test('source JS modified beyond reviewed API literal must fail closed',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mt-modified-'));
 const from=path.join(folder,'source');
 try{
  await fs.mkdir(path.join(from,'secure-assets'),{recursive:true});
  await fs.writeFile(path.join(from,'index.html'),'<html></html>');
  await fs.writeFile(path.join(from,'secure-assets/index-inline-1.js'),
    (await fs.readFile(sourcePath,'utf8'))+'\nUNREVIEWED');
  await assert.rejects(prepareQaBundle({from,to:path.join(folder,'output')}),
    /UNREVIEWED_CANONICAL_WEB_JS_CHANGED/);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
});
