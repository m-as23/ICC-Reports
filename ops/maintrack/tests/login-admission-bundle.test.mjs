import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {protectQaLoginSource,protectClientLoginSource,prepareAdmissionBundle} from '../scripts/prepare-login-admission.mjs';
test('QA package protects every Login route before database work and preserves logout branch',()=>{
 const core=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 assert.throws(()=>protectQaLoginSource(core),/EXISTING_QA_ISOLATION_REQUIRED/);
 const qa='// createQaPool createQaChannel existing isolation contract\n'+core;
 const protectedSource=protectQaLoginSource(qa);assert.equal(protectedSource.includes("a==='login'?await login(b)"),false);assert.ok(protectedSource.includes("a==='login'?await admittedLogin(b)"));assert.ok(protectedSource.includes("a==='logout'?await revokeCurrentSession(req)"));assert.ok(protectedSource.includes('MT_LOGIN_TURNSTILE_SECRET'));assert.ok(!protectedSource.includes('LEGACY_FALLBACK'));
 assert.throws(()=>protectQaLoginSource(protectedSource),/ALREADY_PROTECTED/);
});

test('Web/native client integration cannot silently post Login before proof adapter is configured',()=>{
 const original=fs.readFileSync(new URL('../../../web/maintrack/public/secure-assets/index-inline-1.js',import.meta.url),'utf8');
 const result=protectClientLoginSource(original);assert.ok(result.includes("if(b.action==='login')"));assert.ok(result.includes('await window.MainTrackLoginProof(b)'));assert.ok(result.includes('LOGIN_ADMISSION_CLIENT_NOT_READY'));assert.throws(()=>protectClientLoginSource(result),/ALREADY_PROTECTED/);
});

test('offline package rejects ambiguous duplicate entrypoints and escaping file names',()=>{
 const core=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');const entry={name:'index.ts',content:'// createQaPool createQaChannel\n'+core};
 for(const files of [[entry,entry],[entry,{name:'../escape.mjs',content:''}]])assert.throws(()=>prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files}),/BUNDLE_FILE_IDENTITY/);
});
