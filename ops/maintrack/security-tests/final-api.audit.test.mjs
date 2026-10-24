// Isolated audit of the deployed Final handler with real disposable PostgreSQL SQL.
// No cloud connections, real accounts, credentials, or outbound mail.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
const root=process.env.MT_AUDIT_SOURCE_ROOT||path.resolve(import.meta.dirname,'../../..');
const {PGlite}=createRequire(process.env.LEDGER_PG_PACKAGE||path.join(root,'audit-output/test-runtime/package.json'))('@electric-sql/pglite');
const {transform}=createRequire(path.join(root,'android/maintrack-app/package.json'))('esbuild');
const {createTeamLedger}=await import(path.join(root,'supabase/functions/maintrack-final-047/ledger-service.mjs'));
const origin='https://maintrack-final-security-qa.vercel.app';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let db,handler;const logs=[];
before(async()=>{
 db=new PGlite();
 await db.exec('CREATE TABLE mt_users(id uuid PRIMARY KEY,employee_code text,name text,role text,active boolean,token_version int,must_change boolean,password_hash text); CREATE TABLE mt_sessions(token_hash text,user_id uuid,token_version int,expires_at timestamptz);');
 await db.exec('CREATE TABLE mt_login_rate_guard(key_hash text PRIMARY KEY,window_start timestamptz,attempts int,updated_at timestamptz);');
 for(const [n,role,active,must,version,expiry] of [[1,'owner',true,false,1,3600],[2,'technician',true,false,1,3600],[3,'engineer',true,false,1,3600],[4,'owner',false,false,1,3600],[5,'owner',true,false,2,3600],[6,'owner',true,false,1,-60],[7,'owner',true,true,1,3600],[8,'owner',true,false,1,3600]]){
  await db.query('INSERT INTO mt_users VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[uid(n),String(1000+n),'Synthetic '+n,role,active,version,must,'synthetic-unused']);
  await db.query("INSERT INTO mt_sessions VALUES($1,$2,1,now()+$3*interval '1 second')",[createHash('sha256').update(String(n).repeat(64)).digest('hex'),uid(n),expiry]);
 }
 const query=(sql,args)=>db.query(sql,args);
 const pg={Pool:class{query=query;async connect(){return {query,release(){}}}}};
 const source=await fs.readFile(path.join(root,'supabase/functions/maintrack-final-047/index.ts'),'utf8');
 const compiled=await transform(source.replace(/^import .*;\n/gm,''),{loader:'ts'});
 vm.runInNewContext(compiled.code,{pg,createTeamLedger,createHash,randomBytes,randomUUID,Request,Response,URL,console:{info(v){logs.push(v)},error(v){logs.push(v)}},Deno:{env:{get(){}},serve(fn){handler=fn}}});
});
after(async()=>db?.close());
function request({action='session',token='1'.repeat(64),body,headers={},method='POST',url='https://isolated.invalid/api'}={}){
 return handler(new Request(url,{method,headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(method==='POST'?{body:body??JSON.stringify({action,role:'owner',userId:uid(1),code:'1001',year:2026,id:'SYNTHETIC-REQUEST',decision:'APPROVED'})}:{})}));
}
for(const role of ['technician','engineer'])for(const action of ['adminUsers','adminCreateEmployee','adminResetEmployeePassword','adminSaveUser','adminCatalog','adminCatalogSave','leaveInbox','leaveDecision','overtimeInbox','overtimeDecision','overtimeSummary','teamBalances','teamBalanceDetail','cmmsDelete']){
 test(role+' cannot forge Owner authority for '+action,async()=>{
  const response=await request({action,token:(role==='technician'?'2':'3').repeat(64)});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'FORBIDDEN');
 });
}
for(const [name,token] of [['malformed','invalid'],['unknown','a'.repeat(64)],['disabled','4'.repeat(64)],['version-revoked','5'.repeat(64)],['expired','6'.repeat(64)]]){
 test(name+' session fails closed using actual auth SQL',async()=>{const response=await request({token});assert.equal(response.status,401);assert.equal((await response.json()).error,'AUTH');});
}
test('forced password change blocks privileged actions',async()=>{const response=await request({token:'7'.repeat(64),action:'adminUsers'});assert.equal(response.status,403);assert.equal((await response.json()).error,'CHANGE_REQUIRED');});
test('Owner cannot demote or disable own account',async()=>{
 const response=await request({action:'adminSaveUser',body:JSON.stringify({action:'adminSaveUser',code:'1001',role:'technician',active:false})});
 assert.equal(response.status,400);assert.equal((await response.json()).error,'SELF_ADMIN_CHANGE_BLOCKED');
 const row=(await db.query('SELECT role,active FROM mt_users WHERE id=$1',[uid(1)])).rows[0];assert.equal(row.role,'owner');assert.equal(row.active,true);
});
test('Owner cannot demote a second Owner through employee editor',async()=>{
 const response=await request({body:JSON.stringify({action:'adminSaveUser',code:'1008',role:'technician',active:false})});
 assert.equal(response.status,400);assert.equal((await response.json()).error,'OWNER_ROLE_CANNOT_BE_EDITED_HERE');
});
test('untrusted origin is rejected before auth and has no CORS grant',async()=>{const response=await request({headers:{Origin:'https://attacker.invalid'}});assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);});
test('valid response has no-store and nosniff and contains no session credential',async()=>{const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.ok(!(await response.text()).includes('1'.repeat(64)));assert.ok(logs.every(x=>!x.includes('1'.repeat(64))));});
test('declared oversized request is rejected',async()=>{assert.equal((await request({headers:{'Content-Length':'70000'}})).status,413);});
test('AUDIT P2: actual body size is bounded when Content-Length is absent',async()=>{
 const body=JSON.stringify({action:'session',padding:'x'.repeat(70000)});assert.ok(Buffer.byteLength(body)>65536);
 assert.equal((await request({body})).status,413,'Oversized body must be bounded independently of Content-Length');
});
test('AUDIT P2: malformed JSON is a client error rather than server failure',async()=>{assert.equal((await request({body:'{"action":'})).status,400,'Malformed JSON must not create a false server-error signal');});
test('AUDIT P2: malformed codes cannot exhaust the shared login budget for all users',async()=>{
 // 301 requests ONLY against in-process handler + synthetic local database.
 // No network, password hashes or real employee codes are involved.
 for(let i=0;i<301;i++)await request({body:JSON.stringify({action:'login',code:'invalid-code',pw:'synthetic'})});
 const response=await request({body:JSON.stringify({action:'login',code:'1001',pw:'Synthetic1'})});
 assert.notEqual(response.status,429,'Malformed unauthenticated traffic must not lock every employee out of login');
});
