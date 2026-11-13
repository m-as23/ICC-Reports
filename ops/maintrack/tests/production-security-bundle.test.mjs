import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';import {stripTypeScriptTypes} from 'node:module';
import {prepareProductionSecurity,writeProductionSecurityReview} from '../scripts/prepare-production-security.mjs';
const canonical=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8'),sourceSha256=createHash('sha256').update(canonical).digest('hex'),projectRef='tdnkeskczcsukcujwinu';
const prepare=()=>prepareProductionSecurity({projectRef,sourceSha256});

test('production review derives current canonical Core while preserving business/logout/RBAC and concrete session issuance bytes',()=>{
 const {files,manifest}=prepare(),source=files.find(file=>file.name==='index.ts').content;
 const business=canonical.slice(canonical.indexOf('async function revokeCurrentSession('),canonical.indexOf('const MT_ALLOWED_ORIGINS='));
 assert.ok(source.includes(business),'all canonical business/logout/auth/dispatch functions must remain byte-identical');
 const issue=canonical.slice(canonical.indexOf('async function issue('),canonical.indexOf('async function login('));assert.ok(source.includes(issue),'actual Core session INSERT must be preserved');
 assert.ok(source.includes("a==='login'?await admittedLogin(req,b):a==='logout'?await revokeCurrentSession(req):await dispatch(await auth(req),b)"));assert.ok(!source.includes("a==='login'?await login(b)"));
 assert.ok(source.includes('await registeredStore.assertCurrent(c,identity);'));assert.ok(source.includes("const issued=await issue(u,c);if(await registeredStore.bindSession(c,identity,sha(issued.token))!==true)throw new LoginAdmissionError('IDENTITY_SESSION_BINDING_REQUIRED');return issued;"));assert.ok(source.includes('},admissionPolicy);'));
 assert.equal(manifest.deploy,false);assert.equal(manifest.productionAuthorized,false);assert.equal(manifest.activationBlocked,true);for(const gate of ['sourceComparison','runtimeRoleAttestation','review','backup'])assert.equal(manifest[gate],'PENDING');assert.equal(manifest.canonicalSourceSha256,sourceSha256);assert.equal(manifest.core.identifiedVersion,3);assert.equal(manifest.inventory.identifiedVersion,1);assert.equal(manifest.inventory.included,false);
 for(const file of files){assert.doesNotMatch(file.content,/createQaPool|qaLeaseHarness|createQaChannel|withQaIsolation|maintrack_qa_lease|qa_security_final_20261025|https:\/\/szhstrafzkxzstjdcynl\.supabase\.co/);assert.equal(manifest.files.find(entry=>entry.name===file.name).sha256,createHash('sha256').update(file.content).digest('hex'));}
 assert.ok(files.find(file=>file.name==='registered-login.mjs').content.includes("'npm:@simplewebauthn/server@14.0.3'"));assert.deepEqual(JSON.parse(files.find(file=>file.name==='deno.json').content).compilerOptions,{});
});

test('production composition refuses wrong project or stale local source identity',()=>{
 assert.throws(()=>prepareProductionSecurity(),/EXACT_PRODUCTION_PROJECT_REQUIRED/);assert.throws(()=>prepareProductionSecurity({projectRef:'szhstrafzkxzstjdcynl',sourceSha256}),/EXACT_PRODUCTION_PROJECT_REQUIRED/);assert.throws(()=>prepareProductionSecurity({projectRef,sourceSha256:'0'.repeat(64)}),/CURRENT_CANONICAL_SOURCE_SHA_REQUIRED/);
});

test('generated Core startup configuration defaults closed and cannot substitute QA project or stale SHA',()=>{
 const {files}=prepare(),source=files.find(file=>file.name==='index.ts').content;const start=source.slice(source.indexOf('const productionTarget='),source.indexOf('import {isRequestBody'));
 const evaluate=config=>vm.runInNewContext(start,{Deno:{env:{get:name=>config[name]}}});
 const valid={MT_PRODUCTION_PROJECT_REF:projectRef,MT_REGISTERED_LOGIN_MODE:'production-review-v1',MT_PRODUCTION_SOURCE_SHA256:sourceSha256};
 assert.throws(()=>evaluate({}),/PRODUCTION_REVIEW_CONFIGURATION_REQUIRED/);
 for(const patch of [{MT_PRODUCTION_PROJECT_REF:'szhstrafzkxzstjdcynl'},{MT_REGISTERED_LOGIN_MODE:'qa-reviewed-v1'},{MT_PRODUCTION_SOURCE_SHA256:'0'.repeat(64)}])assert.throws(()=>evaluate({...valid,...patch}),/PRODUCTION_REVIEW_CONFIGURATION_REQUIRED/);
 assert.doesNotThrow(()=>evaluate(valid));
});

test('generated gateway captures Production target despite conflicting caller options and remains unactivated by default',()=>{
 const source=prepare().files.find(file=>file.name==='production-gateway.mjs').content;
 let received;const code=stripTypeScriptTypes(source,{mode:'transform'}).replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'');const create=vm.runInNewContext(code+';createProductionGateway',{createVercelLoginGateway:options=>{received=options;return 'factory';}});
 assert.throws(()=>create({},{}),/PRODUCTION_REVIEW_CONFIGURATION_REQUIRED/);
 assert.equal(create({targetProfile:{projectRef:'szhstrafzkxzstjdcynl',functionSlug:'maintrack-security-qa-final'}},{projectRef,sourceSha256,mode:'production-review-v1'}),'factory');assert.equal(received.targetProfile.projectRef,projectRef);assert.equal(received.targetProfile.functionSlug,'maintrack-final-047');assert.equal(received.ingressContractApproved,undefined);
});


test('review writer rejects existing paths and paths outside the owned audit root',()=>{
 for(const outputDirectory of ['audit-output','ops/maintrack','audit-output/../production-review'])assert.throws(()=>writeProductionSecurityReview({projectRef,sourceSha256,outputDirectory}),/NEW_OWNED_AUDIT_DIRECTORY_REQUIRED/);
});
test('fresh checkout without an owned audit root returns a bounded refusal, never creates it',t=>{
 const original=fs.realpathSync;let attempted=false;
 t.mock.method(fs,'realpathSync',function(value,...args){if(String(value).endsWith('audit-output')){attempted=true;const e=Error('missing owned directory');e.code='ENOENT';throw e;}return original.call(this,value,...args);});
 assert.throws(()=>writeProductionSecurityReview({projectRef,sourceSha256,outputDirectory:'audit-output/new-review'}),/NEW_OWNED_AUDIT_DIRECTORY_REQUIRED/);assert.equal(attempted,true);
});
