import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as builder from '../scripts/prepare-registered-login.mjs';
import {prepareAdmissionBundle} from '../scripts/prepare-login-admission.mjs';

test('registered Gateway package refreshes the actual API adapter and its server dependencies',()=>{
 assert.equal(typeof builder.prepareRegisteredGatewayPackage,'function');
 const files=builder.prepareRegisteredGatewayPackage(),get=n=>files.find(f=>f.name===n)?.content;
 const canonical=fs.readFileSync(new URL('../security/vercel-login-entry.mjs',import.meta.url),'utf8');
 assert.equal(get('api/login.mjs'),canonical.replace('../../../supabase/functions/maintrack-final-047/login-gateway.mjs','../server/login-gateway.mjs'));
 assert.match(get('api/login.mjs'),/QA_WINDOW_CAPABILITY_REQUIRED/);
 assert.match(get('api/core.mjs'),/kind:"core"/);assert.match(get('api/inventory.mjs'),/kind:"inventory"/);assert.match(get('server/qa-session-proxy.mjs'),/QA_ACTION_DENIED/);
 for(const name of ['login-gateway.mjs','login-admission.mjs','login-proof.mjs'])assert.equal(get('server/'+name),fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/'+name,import.meta.url),'utf8'));
});

test('QA client transport loads before application scripts without changing frame policy or exposing a capability',()=>{
 const html='<meta http-equiv="Content-Security-Policy" content="connect-src https://qa-gw.example; frame-ancestors self"><script type="module" src="secure-assets/login-admission-bootstrap.mjs"></script><script src="secure-assets/index-inline-1.js"></script>';
 const web=builder.prepareRegisteredTransportHtml(html),native=builder.prepareRegisteredTransportHtml(html,{native:true});
 assert.ok(web.indexOf('qa-session-transport.js')<web.indexOf('login-admission-bootstrap.mjs'));assert.match(native,/https:\/\/maintrack-registered-isolated-qa\.vercel\.app/);assert.match(web,/frame-ancestors self/);assert.doesNotMatch(web,/MT_QA_WINDOW_CAPABILITY/);assert.throws(()=>builder.prepareRegisteredTransportHtml(web),/HTML_CONTRACT/);
});
test('registered QA composition uses permanent lease, two actors and bounded Core actions',()=>{
 assert.equal(typeof builder.prepareRegisteredPermanentRuntime,'function');
 // Source-transform contract only, never a deployable/cloud acceptance fixture.
 const core=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 const source='// createQaPool createQaChannel\nconst qaChannel=createQaChannel({pool});\nconst qaLease=qaLeaseHarness(pool,"11111111-2222-4333-8444-555555555555");\n'+core+ '\n// Guard closure contract\nconst guardOptions={attest:()=>pool.attest(),activeAuthorized:qaChannel.activeAuthorized};';
 const input=prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files:[{name:'index.ts',content:source},{name:'ledger-service.mjs',content:''},{name:'login-rate-limit.mjs',content:''},{name:'qa-login-lease.mjs',content:''},{name:'channel.mjs',content:''},{name:'qa-guard.mjs',content:"export function withQaIsolation(handler,{attest,activeAuthorized=()=>false}={}){return async req=>{const origin=req.headers.get('origin');if(origin&&origin!=='https://localhost')throw Error('QA_ORIGIN_FORBIDDEN');return handler(req)}};x.accounts===4;x.active_accounts===4;x.synthetic_accounts===4;"}]});
 const b=builder.prepareRegisteredBundle(input);
 const out=builder.prepareRegisteredPermanentRuntime(b),file=n=>out.files.find(f=>f.name===n).content;
 assert.match(file('qa-login-lease.mjs'),/maintrack_qa_permanent\.mutate/);assert.doesNotMatch(file('qa-login-lease.mjs'),/maintrack_qa_lease\./);
 assert.match(file('channel.mjs'),/permanentChannel\(pool,\{allowedOrigins:/);assert.match(file('channel.mjs'),/MT_REGISTERED_ORIGIN/);assert.doesNotMatch(file('channel.mjs'),/qa_control/);
 assert.match(file('index.ts'),/const qaLease=qaLeaseHarness\(pool\);/);assert.match(file('index.ts'),/QA_ACTION_DENIED/);
 assert.match(file('qa-guard.mjs'),/x.accounts===2/);assert.doesNotMatch(file('qa-guard.mjs'),/x\.(accounts|active_accounts|synthetic_accounts)===4/);
 assert.match(file('qa-guard.mjs'),/origin!==registeredOrigin/);assert.match(file('index.ts'),/registeredOrigin:Deno.env.get\('MT_REGISTERED_ORIGIN'\)/);
 assert.match(file('index.ts'),/registeredStore.bindSession/);assert.match(file('index.ts'),/await revokeCurrentSession\(req\)/);
 assert.throws(()=>builder.prepareRegisteredPermanentRuntime({...b,projectRef:'tdnkeskczcsukcujwinu'}),/QA_ONLY/);
});
