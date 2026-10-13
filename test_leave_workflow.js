const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/Code_API.gs','utf8');
const records=[],events=[],mail=[];let balance=5; const store=new Map();
const ctx={console,Date,Math,
 Utilities:{getUuid:()=> '12345678-aaaaaaaa-bbbb-cccc-dddddddddddd',formatDate:(d)=>d.toISOString()},
 Session:{getScriptTimeZone:()=> 'Africa/Cairo'},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 ContentService:{MimeType:{JSON:'JSON'},createTextOutput:(x)=>({setMimeType(){return this},value:x})},
 CacheService:{getScriptCache:()=>({get(k){return store.get(k)||null},put(k,v){store.set(k,v)},remove(k){store.delete(k)}})},
};vm.createContext(ctx);vm.runInContext(code,ctx);
const sheet={
 getLastRow(){return records.length+1},
 appendRow(r){records.push([...r])},
 getRange(row,col,n=1,m=1){return {
   getValues(){return records.slice(row-2,row-2+n).map(r=>r.slice(col-1,col-1+m))},
   setValues(rows){rows.forEach((values,i)=>values.forEach((v,j)=>records[row-2+i][col-1+j]=v))},
   setValue(v){records[row-2][col-1]=v},
   getValue(){return records[row-2][col-1]}
 }}
};
const profile={getRange(row,col,n=1,m=1){return {getValue(){return balance},setValue(v){if(col===4)balance=v},setValues(){}}}};
ctx.leaveSheet_=()=>sheet;
ctx.SpreadsheetApp={getActive:()=>({getSheetByName:(name)=>name==='LeaveRequests'?sheet:null})};
ctx.profileRow_=()=>({row:2,sheet:profile});
ctx.profileData_=(u)=>({leaveBalance:balance,code:u.code});
ctx.user_=(code)=>({code,name:code==='111'?'Amr':'Owner',role:code==='111'?'technician':'owner',active:true,must:false});
ctx.users_=()=>[{code:'222',name:'Owner',role:'owner',active:true}];
ctx.auth_=(token)=>({code:token==='OWNER'?'222':'111',name:token==='OWNER'?'Owner':'Amr',role:token==='OWNER'?'owner':'technician',must:false});
ctx.leaveEvent_=(...args)=>events.push(args);
ctx.queueLeaveMail_=(...args)=>mail.push(args);
const request=ctx.createLeaveRequest_({code:'111',name:'Amr',role:'technician',must:false},{token:'TECH',type:'annual',start:'2026-10-20',end:'2026-10-21'});
assert.equal(request.status,'PENDING');assert.equal(request.days,2);assert.equal(balance,5);
assert.equal(records.length,1);assert.equal(records[0][8],'PENDING');assert.equal(events.length,0);assert.equal(mail.length,0);
const bell=ctx.combineNotices_({code:'222',role:'owner'},[]);assert.equal(bell.pendingCount,1);assert.equal(bell.items[0].target,'leaveDecision');assert.equal(bell.items[0].leave.name,'Amr');
const otherBell=ctx.combineNotices_({code:'111',role:'technician'},[]);assert.equal(otherBell.pendingCount,0);assert.equal(otherBell.items.length,0);
const inbox=ctx.leaveInbox_({code:'222',role:'owner'});assert.equal(inbox.pendingCount,1);
assert.throws(()=>ctx.decideLeave_({code:'111',role:'technician'},{token:'TECH',id:request.id,decision:'APPROVED'}),/FORBIDDEN/);
const approved=ctx.decideLeave_({code:'222',role:'owner'},{token:'OWNER',id:request.id,decision:'APPROVED',reason:''});
assert.equal(approved.balanceAfter,3);assert.equal(balance,3);assert.equal(records[0][8],'APPROVED');
const postBell=ctx.combineNotices_({code:'222',role:'owner'},[]);assert.equal(postBell.pendingCount,0);assert.equal(postBell.items.filter(x=>x.target==='leaveDecision').length,0);
assert.throws(()=>ctx.decideLeave_({code:'222',role:'owner'},{token:'OWNER',id:request.id,decision:'APPROVED'}),/LEAVE_ALREADY_DECIDED/);
assert.equal(balance,3);
assert.throws(()=>ctx.createLeaveRequest_({code:'111',name:'Amr',role:'technician',must:false},{token:'TECH',type:'annual',start:'2026-10-20',end:'2026-10-25'}),/INSUFFICIENT_LEAVE_BALANCE/);
console.log('PASS: owner-only actionable notice, no email/event write, approval deducts once, pending notice removed after decision, replay blocked');
