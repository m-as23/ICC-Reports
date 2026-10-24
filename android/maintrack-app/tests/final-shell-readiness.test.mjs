import test from 'node:test';import assert from 'node:assert/strict';
import {isMainTrackShellReady} from '../update-system/shell-readiness.mjs';
import {createBootHealth} from '../update-system/boot-health.mjs';
test('approved sidebar-only shell can acknowledge OTA boot without a removed bottom dock',async()=>{
 const ids=new Set(['login','form','dashboard','v7FormStatus','v7RefreshLists','v6Toggle']);
 const doc={readyState:'complete',getElementById:id=>ids.has(id)?{}:null};
 const host={MainTrackLocalWork:{},__MainTrackV7Fix:true,__MainTrackV6Integrated:true};
 let acknowledgements=0;
 const health=createBootHealth({isShellReady:()=>isMainTrackShellReady(doc,host),isDataCompatible:()=>true,notifyReady:async()=>{acknowledgements++}});
 assert.equal(await health.check(),true);assert.equal(acknowledgements,1);
 ids.delete('v6Toggle');assert.equal(isMainTrackShellReady(doc,host),false);
 ids.add('v6Toggle');host.__MainTrackV7Fix=false;assert.equal(isMainTrackShellReady(doc,host),false);
});
