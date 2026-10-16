import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWebSession,validateWebRelease} from '../update-system/web-session.mjs';
const origin='https://pilot.example.org',old='a'.repeat(40),next='b'.repeat(40);
const valid={schema:1,appId:'com.icc.maintrack',channel:'web-pilot',commit:next,path:`/releases/${next}/`,expiresAt:100000};
function fixture(){
 const f={release:valid,state:{unsentReports:0,unknownQueue:false,dirtyForm:false,submitting:false,offline:false},held:false,released:0,urls:[]};
 f.session=createWebSession({origin,currentCommit:old,now:()=>1000,fetchRelease:async()=>f.release,localWork:{read:()=>f.state,acquireActivation:()=>{f.held=true;return {isHeld:()=>f.held,release:()=>{f.held=false;f.released++;}};}},navigate:url=>f.urls.push(url)});return f;
}
test('web check never navigates; explicit activation retains lock through navigation',async()=>{const f=fixture();await f.session.check();assert.deepEqual(f.urls,[]);await f.session.activate();assert.deepEqual(f.urls,[origin+valid.path]);assert.equal(f.held,true);assert.equal(f.released,0);});
for(const [key,value] of Object.entries({unsentReports:1,unknownQueue:true,dirtyForm:true,submitting:true,offline:true}))test(`web activation protects ${key}`,async()=>{const f=fixture();await f.session.check();f.state[key]=value;await assert.rejects(f.session.activate(),/LOCAL_WORK_PENDING/);assert.deepEqual(f.urls,[]);assert.equal(f.held,false);});
test('work during final fetch refuses navigation and unlocks',async()=>{const f=fixture();await f.session.check();Object.defineProperty(f,'release',{get(){f.state.dirtyForm=true;return valid;}});await assert.rejects(f.session.activate(),/LOCAL_WORK_PENDING/);assert.equal(f.released,1);assert.deepEqual(f.urls,[]);});
test('changed or expired metadata refuses navigation',async()=>{for(const release of [{...valid,commit:'c'.repeat(40),path:`/releases/${'c'.repeat(40)}/`},{...valid,expiresAt:999}]){const f=fixture();await f.session.check();f.release=release;await assert.rejects(f.session.activate());assert.deepEqual(f.urls,[]);assert.equal(f.released,1);}});
test('only bounded same-origin release directory and app/channel accepted',()=>{for(const patch of [{path:'https://evil.example/'},{path:'/releases/../'},{channel:'production'},{appId:'other'},{commit:'../'},{expiresAt:Infinity},{expiresAt:1e15}])assert.throws(()=>validateWebRelease({...valid,...patch},origin,1000));});
test('same commit and failed recheck clear candidate',async()=>{const f=fixture();await f.session.check();f.release=null;await assert.rejects(f.session.check());await assert.rejects(f.session.activate(),/NO_WEB_UPDATE/);f.release={...valid,commit:old,path:`/releases/${old}/`};assert.equal(await f.session.check(),null);});
test('network failure and visibility interruption release lock',async()=>{for(const mode of ['network','hidden']){const f=fixture();await f.session.check();Object.defineProperty(f,'release',{get(){if(mode==='network')throw Error('NETWORK');f.held=false;return valid;}});await assert.rejects(f.session.activate());assert.equal(f.released,1);assert.deepEqual(f.urls,[]);}});
