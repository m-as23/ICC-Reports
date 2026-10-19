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
 // Legacy source lock remains immutable. The Owner-approved UI correction is
 // allowlisted below with exact Git blob IDs, not an unrestricted asset unlock.
 const allowed=new Set(['index.html','secure-assets/index-inline-1.js','secure-assets/index-inline-1.css','v6-core.js','v6-core.css']);
 const approvedHotfixBlobs={
  'index.html':'b4c57297a5b709f41919673ecd98bb73d09e47ca',
  'v6-core.js':'9cc283b7594f9952339115fdba594883151987ef',
  'v6-core.css':'dc47c4c581b26c3319b0ab241e6c5b9f9a489ced'
 };
 const changed=[];
 for(const item of lock.assets){
  const bytes=fs.readFileSync(path.join(loc,item.path));
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(digest!==item.sha256){
   assert.ok(allowed.has(item.path),'unexpected drift in locked asset: '+item.path);
   changed.push(item.path);
   if(Object.hasOwn(approvedHotfixBlobs,item.path)){
    const blob=crypto.createHash('sha1').update('blob '+bytes.length+'\\0').update(bytes).digest('hex');
    assert.equal(blob,approvedHotfixBlobs[item.path],'unapproved Owner UI hotfix drift: '+item.path);
   }
  }
 }
 assert.deepEqual(new Set(changed),allowed,'Only the three previously reviewed assets plus the approved two bottom-nav assets may change');
 const ui=fs.readFileSync(path.join(loc,'v6-core.js'),'utf8');
 const css=fs.readFileSync(path.join(loc,'v6-core.css'),'utf8');
 const html=fs.readFileSync(path.join(loc,'index.html'),'utf8');
 assert.doesNotMatch(ui,/v6Dock|shortcuts/,'no clickable bottom dock may remain');
 assert.doesNotMatch(css,/v6Dock|padding-bottom:calc\\(78px|bottom:calc\\(76px/,'no dock space may remain');
 assert.doesNotMatch(html,/Pilot demo system|PILOT — بلاغات تجريبية فقط/,'no pilot overlay may remain');
 assert.match(ui,/toggle\\.id='v6Toggle'/,'sidebar menu remains');
 assert.match(ui,/v6Drawer/,'sidebar drawer remains functional');
});

test('server protected and browser connect-src restricted',()=>{
 const src=fs.readFileSync(path.join(loc,'secure-assets/index-inline-1.js'),'utf8');
 const html=fs.readFileSync(path.join(loc,'index.html'),'utf8');
 assert.match(src,/maintrack-stage9-security-api\/api/);
 assert.doesNotMatch(src,/maintrack-stage6-api\/api/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/script-src-attr 'none'/);
});
