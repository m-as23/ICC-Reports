import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as overlay from '../scripts/security-client-overlay.mjs';
test('SEC003 covers every shipped HTML page and aliases while preserving its original CSP',()=>{
 assert.equal(typeof overlay.frameHeaderRules,'function');
 const root=new URL('../../../web/maintrack/public/',import.meta.url);
 const names=fs.readdirSync(root).filter(n=>n.endsWith('.html'));
 const pages=names.map(name=>({name,html:fs.readFileSync(new URL(name,root),'utf8')}));
 const rules=overlay.frameHeaderRules(pages);
 for(const page of pages){for(const route of ['/'+page.name,'/'+page.name.replace(/\.html$/,'')]){
  const rule=rules.find(r=>r.source===route);assert.ok(rule,route);
  const actual=Object.fromEntries(rule.headers.map(h=>[h.key,h.value]));
  assert.equal(actual['X-Frame-Options'],'SAMEORIGIN');
  if(/http-equiv="Content-Security-Policy"/i.test(page.html))assert.deepEqual(actual,overlay.frameHeaders(page.html));
  else assert.equal(actual['Content-Security-Policy'],"frame-ancestors 'self';");
 }}
 assert.ok(rules.find(r=>r.source==='/'));
 assert.deepEqual(rules.find(r=>r.source==='/(.*)').headers,[{key:'X-Frame-Options',value:'SAMEORIGIN'}]);
 assert.throws(()=>overlay.frameHeaderRules([{name:'../escape.html',html:pages[0].html}]),/INVALID_HTML_PATH/);
});
