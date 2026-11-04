import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareAdmissionBundle} from '../scripts/prepare-login-admission.mjs';
import {prepareRegisteredBundle} from '../scripts/prepare-registered-login.mjs';
import {stripTypeScriptTypes} from 'node:module';
import {LoginAdmissionError} from '../../../supabase/functions/maintrack-final-047/login-admission.mjs';
import {LoginRateError} from '../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs';
test('registered Core derivative protects sole login branch without changing logout/password/lease logic',()=>{
 const source='// createQaPool createQaChannel\nconst qaChannel=createQaChannel({pool});\n'+fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 const input=prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files:[{name:'index.ts',content:source},{name:'login-rate-limit.mjs',content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs',import.meta.url),'utf8')},{name:'ledger-service.mjs',content:''}]});
 input.files.find(f=>f.name==='login-gateway.mjs').content='STALE_PARENT_GATEWAY';
 const output=prepareRegisteredBundle(input);assert.equal(output.files.find(f=>f.name==='login-gateway.mjs').content,fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/login-gateway.mjs',import.meta.url),'utf8'));
const core=output.files.find(x=>x.name==='index.ts').content;
 assert.match(core,/createRegisteredLogin/);assert.match(core,/registeredStore.assertCurrent\(c,identity\)/);assert.match(core,/MT_REGISTERED_LOGIN_MODE/);assert.match(core,/a==='login'\?await admittedLogin\(req,b\)/);assert.match(core,/a==='logout'\?await revokeCurrentSession\(req\)/);assert.match(core,/password_hash=extensions.crypt/);assert.equal(output.deploy,false);assert.equal(output.registeredIdentity.cloudAcceptance,'NOT TESTED');
 const module=output.files.find(x=>x.name==='registered-login.mjs').content;assert.match(module,/npm:@simplewebauthn\/server@14.0.3/);assert.doesNotMatch(module,/\.\.\/\.\.\//);assert.throws(()=>prepareRegisteredBundle(output),/ALREADY/);
});

test('emitted Core boundary returns security denials as domain errors rather than internal 500',async()=>{
 const source='// createQaPool createQaChannel\nconst qaChannel=createQaChannel({pool});\n'+fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 const core=prepareRegisteredBundle(prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files:[{name:'index.ts',content:source},{name:'login-rate-limit.mjs',content:fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/login-rate-limit.mjs',import.meta.url),'utf8')},{name:'ledger-service.mjs',content:''}]})).files.find(f=>f.name==='index.ts').content;
 const appClass=stripTypeScriptTypes(core.match(/class AppError[^\r\n]+/)[0],{mode:'transform'});
 const AppError=Function(appClass+';return AppError;')();
 const emitted=core.match(/admittedLogin=async\(req:Request,body:RequestBody\)=>\{[^\r\n]+/)[0].replace('admittedLogin=','const boundary=');
 const build=Function('registeredHandler','AppError','LoginRateError','LoginAdmissionError',stripTypeScriptTypes(emitted,{mode:'transform'})+';return boundary;');
 for(const [original,code,status] of [[Error('verifier details must stay private'),'REGISTERED_LOGIN_REJECTED',403],[new LoginRateError('LOGIN_BUSY'),'LOGIN_BUSY',429],[new LoginAdmissionError('LOGIN_PROVIDER_UNAVAILABLE',503),'LOGIN_PROVIDER_UNAVAILABLE',503]]){
  const boundary=build(async()=>{throw original;},AppError,LoginRateError,LoginAdmissionError);
  await assert.rejects(()=>boundary(new Request('https://qa.invalid'),{}),e=>e instanceof AppError&&e.code===code&&e.status===status);
 }
});
