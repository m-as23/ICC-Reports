// Final credential rules. Existing passwords are never revalidated during login.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function validEmployeeCode(value){return typeof value==='string'&&/^[0-9]{1,32}$/.test(value);}
export function validNewPassword(value){return typeof value==='string'&&value.length>=8&&value.length<=64&&/^[A-Za-z0-9]+$/.test(value)&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);}
export function temporaryPassword(randomBytes){
 // Rejection sampling preserves the crypto RNG; every result has a letter and digit.
 let password;do{password=randomBytes(16).toString('hex');}while(!validNewPassword(password));return password;
}
function once(source,oldText,newText){assert.equal(source.split(oldText).length-1,1,'CREDENTIAL_PATCH_ANCHOR_CHANGED: '+oldText.slice(0,65));return source.replace(oldText,newText);}
export function patchCredentialBackend(source,{requireFinal=true}={}){
 if(requireFinal)assert.equal(createHash('sha256').update(source).digest('hex'),'3124837ae5c78015930b1ee3356c471858b48370441a14603656ba81375d24d7','UNREVIEWED_FINAL_CREDENTIAL_BASELINE');
 let s=source;
 // Inline these pure functions so the existing single-file service stays self-contained.
 s=[validEmployeeCode,validNewPassword,temporaryPassword].map(f=>f.toString()).join('\n')+'\n'+s;
 s=once(s,"const code=text(b.code,1,32,'INVALID_CODE'),password=String(b.pw||'');","const code=b.code;if(!validEmployeeCode(code))die('INVALID_CODE');const password=String(b.pw||'');");
 s=once(s,"const code=text(b.code,2,32,'INVALID_CODE').toUpperCase();\n if(!/^[A-Z0-9_-]+$/.test(code))die('INVALID_CODE');","const code=b.code;\n if(!validEmployeeCode(code))die('INVALID_CODE');");
 s=once(s,"const password=randomBytes(12).toString('base64url');","const password=temporaryPassword(randomBytes);");
 s=once(s,"const pw=text(b.pw,8,256,'INVALID_PASSWORD');","const pw=b.pw;if(!validNewPassword(pw))die('INVALID_PASSWORD');");
 s=once(s,'SELECT ($1=extensions.crypt($1,$2)) AS valid','SELECT ($2=extensions.crypt($1,$2)) AS valid');
 return s;
}
export function patchCredentialAsset(rel,bytes){
 let s=bytes.toString('utf8');
 if(rel==='index.html'){
  s=once(s,'id="lcode" inputmode="text" autocapitalize="characters" autocomplete="username" spellcheck="false" placeholder="مثال: PILOT01" maxlength="64"','id="lcode" type="text" inputmode="numeric" pattern="[0-9]{1,32}" autocomplete="username" spellcheck="false" placeholder="1111" maxlength="32"');
  s=once(s,'id="v6EmpCode" maxlength="32" autocomplete="off"','id="v6EmpCode" type="text" inputmode="numeric" pattern="[0-9]{1,32}" placeholder="1111" maxlength="32" autocomplete="off"');
  s=once(s,'الباسورد الجديد (8 خانات على الأقل)','الباسورد الجديد (8 خانات على الأقل، حروف إنجليزية وأرقام فقط، ولازم حرف ورقم)');
  for(const id of ['np','np2'])s=once(s,'id="'+id+'" type="password"','id="'+id+'" type="password" minlength="8" maxlength="64" autocomplete="new-password"');
 }else if(rel==='secure-assets/index-inline-1.js'){
  s=validEmployeeCode.toString()+'\n'+validNewPassword.toString()+'\n'+s;
  s=once(s,"const ADMIN_WA = '';","const ADMIN_WA = '201270437241';");
  s=once(s,"function help(k){helpKind=k;$('ftxt').textContent=HELP[k].t;$('fbox').style.display='block';if(ADMIN_WA){const w=$('wa');w.style.display='inline-block';w.href='https://wa.me/'+ADMIN_WA+'?text='+encodeURIComponent(HELP[k].w+norm($('lcode').value.trim()));}}","function help(k){helpKind=k;$('ftxt').textContent=HELP[k].t;$('fbox').style.display='block';const w=$('wa'),code=norm($('lcode').value.trim());if(ADMIN_WA&&validEmployeeCode(code)){w.style.display='inline-block';w.href='https://wa.me/'+ADMIN_WA+'?text='+encodeURIComponent(HELP[k].w+code);}else{w.style.display='none';w.removeAttribute('href');}}");
  s=once(s,"if(!code){note('اكتب كود الموظف','err');","if(!validEmployeeCode(code)){note('كود الموظف أرقام فقط، بحد أقصى 32 رقمًا','err');");
  s=once(s,"$('cgo').onclick=async()=>{if($('np').value!==$('np2').value)","$('cgo').onclick=async()=>{if(!validNewPassword($('np').value))return note('كلمة المرور من 8 إلى 64 خانة، حروف إنجليزية وأرقام فقط، ولازم تحتوي على حرف ورقم بدون رموز أو مسافات','err');if($('np').value!==$('np2').value)");
 }else if(rel==='secure-assets/index-inline-2.js'){
  s=once(s,"forgot.addEventListener('click',function(){","forgot.addEventListener('click',function(){const entered=typeof norm==='function'?norm(code.value.trim()):code.value.trim();if(typeof validEmployeeCode==='function'&&!validEmployeeCode(entered)){if(typeof note==='function')note('اكتب كود الموظف بالأرقام أولًا.','err');code.focus();return;}");
 }else if(rel==='v6-core.js'){
  s=once(s,"const run=async action=>{if(!owner())return;const code=val('v6EmpCode').toUpperCase(),name=val('v6EmpName');if(!/^[A-Z0-9_-]{2,32}$/.test(code))return msg('v6EmpMsg','كود الموظف غير صالح.',false);",validEmployeeCode.toString()+"\nconst run=async action=>{if(!owner())return;const code=val('v6EmpCode').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)),name=val('v6EmpName');if(!validEmployeeCode(code))return msg('v6EmpMsg','كود الموظف أرقام فقط، بحد أقصى 32 رقمًا.',false);");
 }else return bytes;
 return Buffer.from(s);
}
