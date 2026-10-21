import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transformClient,transformHtml} from './prepare.mjs';
const old='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
test('API rewrite is exact and fails closed for source drift',()=>{assert.match(transformClient(`const API = '${old}';`),/szhstrafzkxzstjdcynl.supabase.co\/functions\/v1\/maintrack-isolated-e2e-b2\/api/);assert.throws(()=>transformClient("const API='https://other.example';"));assert.throws(()=>transformClient(`'${old}' '${old}'`));});
test('CSP blocks connect before native bootstrap and updater panel is removed',()=>{const s='<head><meta http-equiv="Content-Security-Policy" content="connect-src https://tdnkeskczcsukcujwinu.supabase.co"></head><body><script src="secure-assets/stage15-pilot-update.js"></script><script src="secure-assets/index-inline-1.js"></script></body>';const out=transformHtml(s);assert(!out.includes('stage15-pilot-update'));assert(!out.includes('tdnkesk'));assert(out.includes("connect-src 'none'"));assert(out.indexOf('connect-src')<out.indexOf('index-inline'));});
