import test from 'node:test';import assert from 'node:assert/strict';
import * as overlay from '../scripts/security-client-overlay.mjs';
test('hosted extensionless HTML aliases resolve to the page whose framing policy is emitted',()=>{
 assert.equal(typeof overlay.frameHostingConfig,'function');
 const pages=[{name:'index.html',html:''},{name:'inventory-reference.html',html:''},{name:'nested/index.html',html:''}];
 const config=overlay.frameHostingConfig(pages);
 for(const p of pages){const route='/'+p.name.replace(/\.html$/,'');assert.deepEqual(config.rewrites.find(r=>r.source===route),{source:route,destination:'/'+p.name});assert.ok(config.headers.some(r=>r.source===route&&r.headers.some(h=>h.key==='Content-Security-Policy'&&h.value.includes("frame-ancestors 'self'"))));}
 assert.ok(config.rewrites.every(r=>!r.destination.includes('://')));
 assert.throws(()=>overlay.frameHostingConfig([{name:'../escape.html',html:''}]),/INVALID_HTML_PATH/);
});
