import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createEditorWork,EDITOR_GROUPS} from '../update-system/editor-work.mjs';
import {readTrustedLocalWork} from '../update-system/local-work.mjs';

const html=fs.readFileSync(path.resolve(import.meta.dirname,
  '../../../web/maintrack/public/index.html'),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));

function dom() {
 const handlers=new Map(),fields=new Map();
 for(const id of ids)fields.set(id,{id,type:'text',value:'',hidden:true});
 const document={
  addEventListener(event,handler) {
   if(!handlers.has(event))handlers.set(event,[]);
   handlers.get(event).push(handler);
  },
  getElementById(id){return fields.get(id)||null}
 };
 const send=(type,id)=>{
  for(const handler of handlers.get(type)||[])handler({target:fields.get(id)});
 };
 return {document,fields,send};
}

test('each tracked form field exists: removed profile fields cannot permanently block all updates',()=>{
 const tracked=Object.values(EDITOR_GROUPS).flat();
 for(const id of tracked)assert.ok(ids.has(id),'missing tracked element '+id);
 assert.ok(!tracked.includes('profilePhone')&&!tracked.includes('profilePreferred'));
 for(const id of ['leaveDuration','otDate','otFromHour','otFromMinute','otFromPeriod',
   'otToHour','otToMinute','otToPeriod','otWorkKind','otKind','otReason'])
   assert.ok(tracked.includes(id),'unprotected edit '+id);
});

test('clean editor permits update; new overtime and leave edits block until server acknowledgement',()=>{
 const d=dom(),e=createEditorWork(d.document);
 assert.equal(e.read(),false,'clean app must not block all updates');
 d.send('focusin','otReason');
 d.fields.get('otReason').value='QA shift maintenance';
 d.send('input','otReason');
 assert.equal(e.read(),true,'unsent overtime draft must block activation');
 const done=e.begin('overtimeRequest');
 done({id:'OT-QA'});
 assert.equal(e.read(),false,'successful acknowledgement frees matching form');
 d.send('focusin','leaveDuration');
 d.fields.get('leaveDuration').value='HALF_DAY';
 d.send('change','leaveDuration');
 assert.equal(e.read(),true,'leave half-day field must block');
 const reject=e.begin('leaveRequest');
 reject({error:'NETWORK'});
 assert.equal(e.read(),true,'failed submission must not erase dirty state');
 d.fields.get('leaveDuration').value='';
 d.send('change','leaveDuration');
 assert.equal(e.read(),false,'restoring original value permits safe update');
});

test('in-flight edit after request started remains dirty, even when older submission succeeds',()=>{
 const d=dom(),e=createEditorWork(d.document);
 d.send('focusin','otReason');
 d.fields.get('otReason').value='first note';
 d.send('input','otReason');
 const ack=e.begin('overtimeRequest');
 d.fields.get('otReason').value='newer unsent note';
 d.send('input','otReason');
 ack({id:'OT-previous'});
 assert.equal(e.read(),true,'new unsent edit cannot be discarded by previous ack');
});

test('missing or corrupt trusted work reader fails closed',()=>{
 const state=readTrustedLocalWork(undefined);
 assert.equal(state.unknownQueue,true);
 assert.equal(state.dirtyForm,true);
 assert.equal(state.offline,true);
});
