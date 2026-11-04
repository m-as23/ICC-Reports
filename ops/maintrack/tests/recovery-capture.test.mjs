import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {capturePlan,runCapture,catalogQuery,SCHEMAS} from '../recovery/capture-qa-schema.mjs';
test('schema capture defaults to a nonexecuting plan with no credential values',async()=>{
 const plan=capturePlan();assert.equal(plan.mode,'DryRun');assert.equal(plan.mutations,0);assert.equal(plan.restoreAuthorized,false);assert.equal(plan.prompts,2);
 assert.equal(plan.transport,'direct');assert.match(plan.connection,/host=db\.szhstrafzkxzstjdcynl\.supabase\.co port=5432 user=postgres /);assert.match(plan.connection,/sslmode=verify-full/);
 assert.deepEqual(await runCapture({},()=>{throw Error('MUST_NOT_RUN');}),plan);
 assert.throws(()=>capturePlan({mode:'Capture'}),/EXPLICIT_READONLY_CAPTURE_REQUIRED/);
 assert.throws(()=>capturePlan({'source-commit':'short'}),/EXACT_SOURCE_COMMIT_REQUIRED/);
});
test('catalog selects explicit noncredential attributes and guards QA identity in read-only transaction',()=>{
 assert.match(catalogQuery,/BEGIN READ ONLY/);assert.match(catalogQuery,/WRONG_QA_PROJECT/);assert.match(catalogQuery,/TLS_REQUIRED/);assert.match(catalogQuery,/ROLLBACK/);
 assert.doesNotMatch(catalogQuery,/password_hash|rolpassword|pg_authid|SELECT\s+\*/i);
 assert.equal(SCHEMAS.length,3);assert.equal(SCHEMAS.includes('auth'),false);assert.equal(SCHEMAS.includes('storage'),false);
});
test('synthetic capture binds official tool arguments, private ACL, hashes, and no restore', {skip:process.platform!=='win32'},async()=>{
 const out=path.join('D:\\MainTrack-QA-Recovery',`capture-test-owned-${crypto.randomUUID()}`),calls=[];
 const fake=(exe,args,opts)=>{
  calls.push({exe,args,opts});
  if(exe===process.execPath)return {status:0,stdout:JSON.stringify({projectRef:'szhstrafzkxzstjdcynl',host:'db.szhstrafzkxzstjdcynl.supabase.co',reachable:true})};
  if(exe==='whoami.exe')return {status:0,stdout:'"test","S-1-5-21-1-2-3-1000"'};
  if(exe==='icacls.exe')return {status:0,stdout:''};
  if(exe==='psql.exe'){assert.equal(opts.stdio,'inherit');fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({projectRef:'szhstrafzkxzstjdcynl',database:'postgres',schemas:SCHEMAS,backendSsl:true,tlsProtocol:'TLSv1.3'}));return {status:0};}
  if(exe==='pg_dump.exe'){assert.equal(opts.stdio,'inherit');assert.ok(args.includes('--schema-only'));assert.ok(args.includes('--format=custom'));assert.ok(args.includes('--password'));assert.ok(!args.includes('--no-owner'));assert.ok(!args.includes('--no-acl'));fs.writeFileSync(args[args.indexOf('--file')+1],'synthetic archive only');return {status:0};}
  if(exe==='pg_restore.exe'){assert.equal(args[0],'--list');return {status:0,stdout:'synthetic index only'};}
  throw Error('UNEXPECTED_TOOL');
 };
 try{const result=await runCapture({mode:'Capture','execute-readonly':'yes',output:out},fake);assert.equal(result.status,'CAPTURED_PENDING_SECRET_REVIEW_AND_LOCAL_RESTORE');assert.equal(result.files.length,3);assert.equal(result.mutations,0);assert.equal(result.restoreAuthorized,false);assert.equal(calls.filter(x=>x.exe==='psql.exe').length,1);assert.equal(calls.filter(x=>x.exe==='pg_dump.exe').length,1);assert.ok(calls.find(x=>x.exe==='icacls.exe').args.includes('/inheritance:r'));}
 finally{assert.ok(path.basename(out).startsWith('capture-test-owned-'));if(fs.existsSync(out))fs.rmSync(out,{recursive:true});}
});
test('failed interactive capture stops without dump or retries', {skip:process.platform!=='win32'},async()=>{
 const out=path.join('D:\\MainTrack-QA-Recovery',`capture-test-owned-${crypto.randomUUID()}`);let prompts=0;
 const fake=(exe,args)=>{if(exe===process.execPath)return {status:0,stdout:JSON.stringify({projectRef:'szhstrafzkxzstjdcynl',host:'db.szhstrafzkxzstjdcynl.supabase.co',reachable:true})};if(exe==='whoami.exe')return {status:0,stdout:'S-1-5-21-1-2-3-1000'};if(exe==='icacls.exe')return {status:0};if(exe==='psql.exe'){prompts++;return {status:1};}throw Error('UNSAFE_FOLLOWUP');};
 try{await assert.rejects(()=>runCapture({mode:'Capture','execute-readonly':'yes',output:out},fake),/CATALOG_CAPTURE_FAILED_NO_RETRY/);assert.equal(prompts,1);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'capture-manifest.json'))).status,'CATALOG_CAPTURE_FAILED');}
 finally{assert.ok(path.basename(out).startsWith('capture-test-owned-'));if(fs.existsSync(out))fs.rmSync(out,{recursive:true});}
});
test('unavailable direct route stops before directory creation or password prompts',async()=>{
 let calls=0;await assert.rejects(()=>runCapture({mode:'Capture','execute-readonly':'yes'},(exe)=>{calls++;assert.equal(exe,process.execPath);return {status:0,stdout:JSON.stringify({reachable:false})};}),/DIRECT_QA_NETWORK_UNAVAILABLE_NO_PASSWORD_PROMPT/);assert.equal(calls,1);
});
test('explicit pooler cannot silently replace direct or relax backend TLS',()=>{
 const plan=capturePlan({transport:'qa-session-pooler'});assert.equal(plan.transport,'qa-session-pooler');assert.match(plan.connection,/user=postgres\.szhstrafzkxzstjdcynl/);assert.match(plan.connection,/sslmode=verify-full/);assert.match(catalogQuery,/IF NOT coalesce\(\(SELECT ssl FROM pg_stat_ssl/);
});
test('false backend TLS stops before pg_dump even when client transport is verify-full',async()=>{
 const out=path.join('D:\\MainTrack-QA-Recovery',`capture-test-owned-${crypto.randomUUID()}`);let dumps=0;
 const fake=(exe,args)=>{
  if(exe==='whoami.exe')return {status:0,stdout:'S-1-5-21-1-2-3-1000'};if(exe==='icacls.exe')return {status:0};
  if(exe==='psql.exe'){fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({projectRef:'szhstrafzkxzstjdcynl',database:'postgres',schemas:SCHEMAS,backendSsl:false,tlsProtocol:null}));return {status:0};}
  if(exe==='pg_dump.exe')dumps++;throw Error('UNSAFE_FOLLOWUP');
 };
 try{await assert.rejects(()=>runCapture({mode:'Capture','execute-readonly':'yes',transport:'qa-session-pooler',output:out},fake),/BACKEND_TLS_REQUIRED_BEFORE_DUMP/);assert.equal(dumps,0);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'capture-manifest.json'))).status,'BACKEND_TLS_UNVERIFIED');}
 finally{assert.ok(path.basename(out).startsWith('capture-test-owned-'));if(fs.existsSync(out))fs.rmSync(out,{recursive:true});}
});
