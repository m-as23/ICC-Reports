import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('static worker preserves every prepared field from locked reference engine for 3920 items',()=>{
 const rows=Array.from({length:3920},(_,i)=>({code:'QA-'+i,description:['CONTACTOR 65 A 220 V','CONTACTOR 165 A 380 V','PT100','THERMOCOUPLE TYPE K','ليمت سويتش'][i%5],quantity:i%7?i:null,location:'R'+i%9,extra:{newCard:'C1',drawer:'D1',iccCode:'A-'+i,sourceSheet:i%2?'parts':'locations'}}));
 const ref=read('web/maintrack/public/inventory-reference.js'),integration=read('web/maintrack/public/inventory-reference-integration.js'),map=integration.match(/function toReferenceItem\(x\)\{[^\n]+\}/)[0];
 const baseline=vm.createContext({rows});vm.runInContext(ref.slice(0,ref.indexOf('function getFacetValues'))+'\n'+map+'\nmt6SetData(rows.map(toReferenceItem));globalThis.result=INDEX;',baseline);
 let result;const self={postMessage:x=>result=x};const context=vm.createContext({self});vm.runInContext(read('web/maintrack/public/inventory-reference-worker.js'),context);self.onmessage({data:rows});
 assert.equal(result.ok,true);assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),JSON.parse(JSON.stringify(baseline.result)));assert.equal(rows[0].kind,undefined);
});
