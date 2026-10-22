import test from 'node:test';import assert from 'node:assert/strict';
import {collectSearchResults,filterItems,sortItems,describeItem} from './inventory-presentation.mjs';
test('filters/sort see every pinned search page and retain missing quantities as unknown',async()=>{
 const calls=[];const search=async(q,{offset})=>{calls.push(offset);return {versionId:'2',offset,totalMatches:2,nextOffset:offset===0?1:null,items:[{code:offset?'B':'A',description:offset?'Parker inverter 90L':'Parker inverter 65A',quantity:offset?null:0,location:offset?'R2':'R1'}]};};
 const rows=await collectSearchResults(search,'Parker');assert.deepEqual(calls,[0,1]);assert.equal(rows.length,2);assert.equal(filterItems(rows,{stock:'unknown'})[0].code,'B');assert.equal(filterItems(rows,{stock:'zero'})[0].code,'A');assert.equal(filterItems(rows,{category:'drives',location:'R2'}).length,1);assert.equal(sortItems(rows,'quantity')[1].quantity,null);assert.equal(describeItem(rows[0]).category,'drives');
});
test('incomplete or changed versions never become a supposedly complete filter dataset',async()=>{
 await assert.rejects(collectSearchResults(async()=>({versionId:'1',offset:0,totalMatches:2,nextOffset:null,items:[{code:'A'}]}),'x'),/INCOMPLETE_SEARCH/);
 let i=0;await assert.rejects(collectSearchResults(async(q,{offset})=>({versionId:String(++i),offset,totalMatches:2,nextOffset:offset===0?1:null,items:[{code:String(i)}]}),'x'),/VERSION_CHANGED/);
});
