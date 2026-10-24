import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
import {prepareFinal047} from '../scripts/prepare-final-047.mjs';
const fixture=new URL('../team-ledger/test/unified-v21.fixture.ts',import.meta.url);
async function currentBackend(){
 let s=await fs.readFile(fixture,'utf8');
 try {const {patchCredentialBackend}=await import('../scripts/credential-policy.mjs');s=patchCredentialBackend(s,{requireFinal:false});} catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
 return s;
}
async function employee(code){
 const source=await currentBackend(),start=source.indexOf('async function employeeAdmin(u,b){'),end=source.indexOf('\nconst cmmsFrom',start);
 let helpers='';try{const m=await import('../scripts/credential-policy.mjs');helpers=[m.validEmployeeCode,m.validNewPassword,m.temporaryPassword].map(f=>f.toString()).join('\n');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
 const writes=[];const sandbox={randomBytes,permit(){},text(v,min,max,error){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw Error(error);return v.trim()},die(code){throw Error(code)},transaction:f=>f({query:async(...a)=>{writes.push(a);return {rows:[]}}}),first:async()=>({id:'test'}),writes};
 vm.runInNewContext(helpers+'\n'+source.slice(start,end)+'\nthis.run=employeeAdmin',sandbox);
 const response=await sandbox.run({role:'owner'},{action:'adminCreateEmployee',code,name:'test employee',role:'technician'});return {response,writes};
}
test('employee codes preserve leading zero and accept a single digit',async()=>{assert.equal((await employee('0011')).response.code,'0011');assert.equal((await employee('1')).response.code,'1');});
test('employee creation rejects alphabetic, symbolic and Unicode codes',async()=>{for(const code of ['PILOT01','AB12','12-3','12_3','١٢٣','12 34','1111\n',' 1111','1111 '])await assert.rejects(employee(code),/INVALID_CODE/);});
test('temporary passwords always contain letters and digits without symbols',async()=>{for(let i=0;i<40;i++){const {temporaryPassword:p}= (await employee('1111')).response;assert.match(p,/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,64}$/);}});
test('new password policy rejects symbols, whitespace and missing letter or digit',async()=>{
 const source=await currentBackend();const match=source.match(/case 'change':\{([\s\S]*?)return transaction/);assert.ok(match);
 let helpers='';try{const m=await import('../scripts/credential-policy.mjs');helpers=m.validNewPassword.toString();}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
 const check=vm.runInNewContext(helpers+'\n(input)=>{const b={pw:input};'+match[1]+'return pw}',{text:(s,min,max,error)=>{if(typeof s!=='string'||s.trim().length<min||s.trim().length>max)throw Error(error);return s.trim()},die:c=>{throw Error(c)}});
 for(const pw of ['abcdefgh','12345678','Ab12345!',' Ab123456','Ab123456 ','Ab123456\n','Ab١٢٣٤٥٦','أب123456','Ab12345','A1'.repeat(33)])assert.throws(()=>check(pw),/INVALID_PASSWORD/);
 for(const pw of ['a1234567','A1234567','AbCd1234','a1'.repeat(32)])assert.equal(check(pw),pw);
});
test('Final login and employee fields show numeric input and no pilot placeholder',async()=>{
 const parent=await fs.mkdtemp(new URL('../../../audit-output/credential-test-',import.meta.url));const target=parent+'/candidate';
 try{await prepareFinal047({target});const html=await fs.readFile(target+'/web/index.html','utf8');for(const id of ['lcode','v6EmpCode']){const tag=html.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))?.[0];assert.ok(tag);assert.match(tag,/inputmode="numeric"/);assert.match(tag,/placeholder="1111"/);}assert.doesNotMatch(html,/placeholder="مثال: PILOT01"/);}finally{await fs.rm(parent,{recursive:true,force:true});}
});
