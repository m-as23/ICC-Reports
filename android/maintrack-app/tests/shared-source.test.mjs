import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const loc=path.resolve(root,'../../web/maintrack/public');
const lock=JSON.parse(fs.readFileSync(path.resolve(root,'../../web/maintrack/source-lock.json')));
const data=JSON.parse(fs.readFileSync(path.join(root,'approved-assets.lock.json')));
test('shared frontend source is the approved Stage11 baseline',()=>{
 assert.equal(lock.sourceDeployment,data.sourceDeployment);
 assert.equal(lock.assets.length,18);
 for(const item of lock.assets){
  const bytes=fs.readFileSync(path.join(loc,item.path));
  const wanted=item.path==='index.html'?lock.nativeIndex:item;
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),wanted.sha256,item.path);
 }
});
test('server protected and browser connect-src restricted',()=>{
 const src=fs.readFileSync(path.join(loc,'secure-assets/index-inline-1.js'),'utf8');
 const html=fs.readFileSync(path.join(loc,'index.html'),'utf8');
 assert.match(src,/maintrack-stage9-security-api\/api/);
 assert.doesNotMatch(src,/maintrack-stage6-api\/api/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/script-src-attr 'none'/);
});
