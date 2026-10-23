import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
function load(){
 const c={window:{},navigator:{onLine:true},AbortController,setTimeout,clearTimeout,console,mt6EnrichAsync(){},mt6Generation:1,mt6Pending:null,state:{base:[]},mt6Status(message,mode){c.mode=mode;},renderAll(){c.renders++;},renders:0,
 clean:x=>String(x).toLowerCase(),compact:x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,''),mt6MeasurementMatch:()=>true,mt7HasConcept:()=>true,INDEX:[]};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web/maintrack/public/inventory-hybrid.js','utf8'),c);return c;
}
test('exact code and literal matches survive inferred categories and outrank technical/semantic results',()=>{
 const c=load(),rows=[{c:'LIMIT',d:'Limit switch',text:'limit limit switch',compactCode:'limit'},{c:'OTHER',d:'LIMIT holder',text:'other limit holder',compactCode:'other'},{c:'LOCAL',d:'legacy technical',text:'local legacy technical',compactCode:'local'},{c:'SEM',d:'semantic',text:'semantic',compactCode:'sem'}];
 const merged=c.window.MainTrackHybrid.merge({raw:'LIMIT',index:rows,local:[{...rows[2],_score:9999}],codes:['SEM','LIMIT','invented'],parsed:{}});
 assert.deepEqual(Array.from(merged,x=>x.c),['LIMIT','OTHER','LOCAL','SEM']);assert.equal(merged[0]._mt6AI,false);assert.equal(merged[3]._mt6AI,true);assert.equal(merged.length,4);
});
test('semantic results append while a partial model or an explicit Type K remains constrained',()=>{
 const c=load(),rows=[{c:'J',d:'TYPE J',text:'type j'},{c:'K',d:'TYPE K',text:'type k'},{c:'A',d:'M700',text:'m700'},{c:'B',d:'M800',text:'m800'}];
 assert.deepEqual(Array.from(c.window.MainTrackHybrid.merge({raw:'حساس type K',index:rows,local:[],codes:['J','K'],parsed:{}}),x=>x.c),['K']);
 assert.deepEqual(Array.from(c.window.MainTrackHybrid.merge({raw:'درايف M700',index:rows,local:[],codes:['A','B'],parsed:{}}),x=>x.c),['A']);
});
test('semantic enrichment runs even with local matches and ignores a superseded response',async()=>{
 const c=load();c.INDEX=[{c:'L',d:'literal',text:'literal',compactCode:'l'},{c:'S',d:'other',text:'other',compactCode:'s'}];c.state.base=[{...c.INDEX[0],_score:300}];
 let resolve,called=0;c.window.MainTrackAI={search:()=>{called++;return new Promise(r=>resolve=r);}};
 const task=c.mt6EnrichAsync('literal',{},c.state.base,1);await new Promise(r=>setTimeout(r,0));assert.equal(called,1);c.mt6Generation=2;resolve({mode:'semantic',codes:['S']});await task;assert.deepEqual(Array.from(c.state.base,x=>x.c),['L']);
});
test('semantic success adds without replacing literal rows and missing provider remains local',async()=>{
 const c=load();c.INDEX=[{c:'L',d:'literal',text:'literal',compactCode:'l'},{c:'S',d:'other',text:'other',compactCode:'s'}];c.state.base=[];c.window.MainTrackAI={search:async()=>({mode:'semantic',codes:['S']})};
 await c.mt6EnrichAsync('literal',{},[],1);assert.deepEqual(Array.from(c.state.base,x=>x.c),['L','S']);assert.equal(c.mode,'augmented');
 delete c.window.MainTrackAI;c.state.base=[];await c.mt6EnrichAsync('literal',{},[],1);assert.deepEqual(Array.from(c.state.base,x=>x.c),['L']);
});
