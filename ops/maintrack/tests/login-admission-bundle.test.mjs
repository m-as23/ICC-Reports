import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {protectQaLoginSource,protectClientLoginSource,prepareAdmissionBundle,prepareAdmissionClientFiles,prepareAdmissionHtml,admissionClientBootstrap} from '../scripts/prepare-login-admission.mjs';
test('QA package protects every Login route before database work and preserves logout branch',()=>{
 const core=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 assert.throws(()=>protectQaLoginSource(core),/EXISTING_QA_ISOLATION_REQUIRED/);
 const qa='// createQaPool createQaChannel existing isolation contract\n'+core;
 const protectedSource=protectQaLoginSource(qa);assert.equal(protectedSource.includes("a==='login'?await login(b)"),false);assert.ok(protectedSource.includes("a==='login'?await admittedLogin(req,b)"));assert.ok(protectedSource.includes("a==='logout'?await revokeCurrentSession(req)"));assert.ok(protectedSource.includes('MT_LOGIN_TURNSTILE_SECRET'));assert.ok(!protectedSource.includes('LEGACY_FALLBACK'));
 assert.throws(()=>protectQaLoginSource(protectedSource),/ALREADY_PROTECTED/);
});

test('Web/native client integration cannot silently post Login before proof adapter is configured',()=>{
 const original=fs.readFileSync(new URL('../../../web/maintrack/public/secure-assets/index-inline-1.js',import.meta.url),'utf8');
 const result=protectClientLoginSource(original);assert.ok(result.includes("if(b.action==='login')"));assert.ok(result.includes('await window.MainTrackGatewayLogin(b)'));assert.ok(result.includes('LOGIN_ADMISSION_CLIENT_NOT_READY'));assert.throws(()=>protectClientLoginSource(result),/ALREADY_PROTECTED/);
});

test('offline package rejects ambiguous duplicate entrypoints and escaping file names',()=>{
 const core=fs.readFileSync(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');const entry={name:'index.ts',content:'// createQaPool createQaChannel\n'+core};
 for(const files of [[entry,entry],[entry,{name:'../escape.mjs',content:''}]])assert.throws(()=>prepareAdmissionBundle({projectRef:'szhstrafzkxzstjdcynl',deploy:false,files}),/BUNDLE_FILE_IDENTITY/);
});

test('emitted Web/native modules close their local imports and never include server verifier configuration',()=>{
 const original=fs.readFileSync(new URL('../../../web/maintrack/public/secure-assets/index-inline-1.js',import.meta.url),'utf8');const files=prepareAdmissionClientFiles(original);
 assert.equal(files.length,3);const provider=files.find(x=>x.name==='secure-assets/login-turnstile-client.mjs').content;assert.ok(provider.includes("from './login-proof.mjs'"));assert.equal(provider.includes('../../../supabase'),false);
 for(const file of files)assert.doesNotMatch(file.content,/MT_LOGIN_TURNSTILE_SECRET|turnstile\/v0\/siteverify/);
});

test('admission HTML permits only the required provider script/frame while retaining CSP and framing directives',()=>{
 const html=fs.readFileSync(new URL('../../../web/maintrack/public/index.html',import.meta.url),'utf8'),out=prepareAdmissionHtml(html);
 assert.ok(out.includes('login-admission-bootstrap.mjs'));assert.ok(out.includes("frame-src 'self' https://challenges.cloudflare.com"));assert.ok(out.includes("base-uri 'none'"));assert.ok(out.includes("object-src 'none'"));assert.ok(out.includes('script-src-attr'));
 assert.ok(admissionClientBootstrap().indexOf('PUBLIC_CONFIG_REQUIRED')<admissionClientBootstrap().indexOf("script.src='https://challenges.cloudflare.com"));assert.throws(()=>prepareAdmissionHtml(out),/ALREADY_PREPARED/);
});

test('native WebView profile admits only an explicitly supplied HTTPS gateway origin in connect-src',()=>{
 const html=fs.readFileSync(new URL('../../../web/maintrack/public/index.html',import.meta.url),'utf8');const result=prepareAdmissionHtml(html,'https://qa-gw.example');assert.match(result,/connect-src[^;]*https:\/\/qa-gw\.example/);assert.throws(()=>prepareAdmissionHtml(html,'http://qa-gw.example'),/ORIGIN_REQUIRED/);assert.throws(()=>prepareAdmissionHtml(html,'https://qa-gw.example/other'),/ORIGIN_REQUIRED/);
});
