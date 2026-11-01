import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareAdmissionBundle} from '../scripts/prepare-login-admission.mjs';
import {prepareRegisteredBundle} from '../scripts/prepare-registered-login.mjs';
test('registered Core derivative protects sole login branch without changing logout/password/lease logic',()=>{
 const source='// createQaPool createQaChannel\nconst qaChannel=createQaChannel({pool});\n'+fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 const input=prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files:[{name:'index.ts',content:source},{name:'login-rate-limit.mjs',content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs',import.meta.url),'utf8')},{name:'ledger-service.mjs',content:''}]});
 const output=prepareRegisteredBundle(input);const core=output.files.find(x=>x.name==='index.ts').content;
 assert.match(core,/createRegisteredLogin/);assert.match(core,/registeredStore.assertCurrent\(c,identity\)/);assert.match(core,/MT_REGISTERED_LOGIN_MODE/);assert.match(core,/a==='login'\?await admittedLogin\(req,b\)/);assert.match(core,/a==='logout'\?await revokeCurrentSession\(req\)/);assert.match(core,/password_hash=extensions.crypt/);assert.equal(output.deploy,false);assert.equal(output.registeredIdentity.cloudAcceptance,'NOT TESTED');
 const module=output.files.find(x=>x.name==='registered-login.mjs').content;assert.match(module,/npm:@simplewebauthn\/server@14.0.3/);assert.doesNotMatch(module,/\.\.\/\.\.\//);assert.throws(()=>prepareRegisteredBundle(output),/ALREADY/);
});
