import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const loc=path.resolve(root,'../../web/maintrack/public');
const lock=JSON.parse(fs.readFileSync(path.resolve(root,'../../web/maintrack/source-lock.json')));
const data=JSON.parse(fs.readFileSync(path.join(root,'approved-assets.lock.json')));
test('Stage22 source changes exactly the three approved UI resources, never other locked assets',()=>{
 assert.deepEqual(lock,data,'original Web/Android trust baselines must agree');
 assert.equal(lock.assets.length,18);
 const allowed=new Set(['index.html','secure-assets/index-inline-1.js','secure-assets/index-inline-1.css']);
 const changed=[];
 for(const item of lock.assets){
  const bytes=fs.readFileSync(path.join(loc,item.path));
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(digest!==item.sha256){
   assert.ok(allowed.has(item.path),'unexpected drift in locked asset: '+item.path);
   changed.push(item.path);
  }
 }
 assert.deepEqual(new Set(changed),allowed,'Stage22 must change only the reviewed UI trio');
});

test('server protected and browser connect-src restricted',()=>{
 const src=fs.readFileSync(path.join(loc,'secure-assets/index-inline-1.js'),'utf8');
 const html=fs.readFileSync(path.join(loc,'index.html'),'utf8');
 assert.match(src,/maintrack-stage9-security-api\/api/);
 assert.doesNotMatch(src,/maintrack-stage6-api\/api/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/script-src-attr 'none'/);
});
