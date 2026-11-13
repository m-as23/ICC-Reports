import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyLogoutClient,frameHeaders} from '../scripts/security-client-overlay.mjs';
const root=new URL('../../../',import.meta.url);
test('immutable canonical assets retain every approved SHA256',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('ops/maintrack/security/owner-047-preview-source.json',root)));
 for(const x of policy.assets)assert.equal(createHash('sha256').update(fs.readFileSync(new URL('web/maintrack/public/'+x.path,root))).digest('hex'),x.sha256,x.path);
});
test('overlay adds explicit confirmed logout without modifying canonical input',()=>{
 const original=fs.readFileSync(new URL('web/maintrack/public/secure-assets/index-inline-1.js',root),'utf8');
 const output=applyLogoutClient(original);assert.ok(!original.includes('async function logoutCurrentSession('));
 assert.ok(output.includes('r.ok===true&&r.revoked===true'));assert.throws(()=>applyLogoutClient(output),/ALREADY_PRESENT/);
});
test('EP001 appends a response directive, preserving every original CSP directive',()=>{
 for(const name of ['index.html','inventory-reference.html']){
  const html=fs.readFileSync(new URL('web/maintrack/public/'+name,root),'utf8');
  const old=html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)[1];
  const h=frameHeaders(html);assert.equal(h['X-Frame-Options'],'SAMEORIGIN');
  assert.equal(h['Content-Security-Policy'],old.trim().replace(/;?$/,"; frame-ancestors 'self';"));
 }
});
test('missing or conflicting CSP and changed logout anchor stop the build',()=>{
 assert.throws(()=>frameHeaders('<html>'),/ORIGINAL_CSP/);
 assert.throws(()=>frameHeaders('<meta http-equiv="Content-Security-Policy" content="frame-ancestors *">'),/UNREVIEWED/);
 assert.throws(()=>applyLogoutClient('async function post(b){'),/HANDLER_CHANGED/);
});
