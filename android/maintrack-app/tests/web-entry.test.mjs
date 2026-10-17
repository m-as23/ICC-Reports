import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

test('protected web metadata uses same-origin session and distinguishes current from failure', async () => {
  const commit = 'a'.repeat(40);
  const bundled = await build({entryPoints:[new URL('../update-system/web-entry.mjs',import.meta.url).pathname],bundle:true,write:false,format:'iife',define:{__MAINTRACK_WEB_CONFIG__:JSON.stringify({commit})}});
  const nodes = [];
  let fail = false, requests = 0, hideMessage, startCheck;
  const context = {
    document:{visibilityState:'visible',getElementById(){return {append(){}};},createElement(){const n={setAttribute(){},append(){}};nodes.push(n);return n;},body:{append(){}},addEventListener(){}},
    navigator:{onLine:true},location:{origin:'https://qa.example',search:'',hash:''},
    setInterval(){throw Error('AUTOMATIC_CHECK_NOT_ALLOWED');},addEventListener(){},
    setTimeout(fn,ms){if(ms===0) startCheck=fn; else if(ms===300000) { /* periodic metadata check; do not fire in this fixture */ } else {assert.equal(ms,5000);hideMessage=fn;}return 1;},clearTimeout(){},AbortSignal,TextDecoder,Uint8Array,URL,
    fetch:async (url,options) => {
      requests++;
      assert.equal(url,'/maintrack-release.json');
      // Model a protected host: absent same-origin cookies fails the fetch.
      if(options.credentials!=='same-origin'||fail) throw Error('SSO_REDIRECT');
      assert.equal(options.redirect,'error');
      assert.equal(options.cache,'no-store');
      return new Response(JSON.stringify({schema:1,appId:'com.icc.maintrack',channel:'web-pilot',commit,path:`/releases/${commit}/`,expiresAt:Date.now()+60000}),{headers:{'Content-Type':'application/json'}});
    }
  };
  vm.runInNewContext(bundled.outputFiles[0].text,context);
  assert.equal(requests,0);
  startCheck(); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(requests,1);
  assert.equal(nodes[0].hidden,true);
  assert.equal(nodes[1].hidden,true);
  assert.equal(nodes[1].hidden,true);
  await nodes[2].onclick();
  assert.equal(requests,2);
  assert.equal(nodes[1].textContent,'أنت على الإصدار الحالي.');
  assert.equal(nodes[3].hidden,true);
  assert.equal(nodes[1].hidden,false);
  hideMessage();
  assert.equal(nodes[1].hidden,true);
  assert.equal(nodes[1].textContent,'');
  fail=true;
  await nodes[2].onclick();
  assert.equal(nodes[1].textContent,'تعذر التحقق من التحديث. يمكنك متابعة العمل.');
  assert.equal(nodes[3].hidden,true);
  hideMessage();
  assert.equal(nodes[1].hidden,true);
});
