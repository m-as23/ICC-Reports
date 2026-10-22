// CP-06 MainTrack 0.4.7: synthetic DB port, no network, no real sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresInventoryStore} from '../src/postgres-store.mjs';
const good={code:'DRIVE-1',description:'Parker M700 Inverter 65A 90L',quantity:'2.0000',location:'R1',extra:{}};
const also={code:'DRIVE-2',description:'Parker M700 Inverter 165A 190L',quantity:'4.0000',location:'R2',extra:{}};
const bearing={code:'BEARING-A65',description:'Bearing 65 type A',quantity:'7.0000',location:'R3',extra:{}};
const storeFor=rows=>{
 const calls=[];
 const pool={connect(){throw Error('not permitted in read-only test');},
 async query(sql,params){
  calls.push({sql,params});
  if(sql.includes('FROM inv_lab.active a LEFT JOIN inv_lab.versions'))
   return {rows:[{versionId:'9',generation:'2',filename:'approved.xlsx'}]};
  return {rows};
 }};
 return {store:new PostgresInventoryStore({pool,privateFiles:{putObject(){throw Error('no writes');},deleteObject(){throw Error('no deletes');}}}),calls};
};
test('Search reads only the current sealed approved version, preserving original rows',async()=>{
 const {store,calls}=storeFor([bearing,good,also]);
 const result=await store.search('65 أمبير',50);
 assert.deepEqual(result,[good]);
 assert.strictEqual(result[0],good);
 assert.equal(result[0].quantity,'2.0000');
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/FROM inv_lab\.active a JOIN inv_lab\.versions v ON v\.id=a\.current_version_id/);
 assert.match(calls[0].sql,/JOIN inv_lab\.items i ON i\.version_id=v\.id/);
 assert.match(calls[0].sql,/v\.status='current' AND v\.sealed=true/);
 assert.deepEqual(calls[0].params,[30001]);
});
test('Broad query keeps all genuine matches; precise ampere/model excludes wrong item',async()=>{
 const {store}=storeFor([good,also,bearing]);
 assert.deepEqual(await store.search('انفرتر باركر'),[good,also]);
 assert.deepEqual(await store.search('Parker 65A'),[good]);
 assert.deepEqual(await store.search('Parker 165 A'),[also]);
 assert.deepEqual(await store.search('90 L'),[good]);
 assert.deepEqual(await store.search('90L nonexistent'),[]);
});
test('Never silently truncate confirmed inventory scan; never query DB on invalid input',async()=>{
 const {store,calls}=storeFor([]);
 await assert.rejects(()=>store.search(''),/INVALID_QUERY/);
 await assert.rejects(()=>store.search('x'.repeat(121)),/INVALID_QUERY/);
 await assert.rejects(()=>store.search('Parker',101),/INVALID_LIMIT/);
 assert.equal(calls.length,0);
 const large=storeFor(Array.from({length:30001},(_,i)=>({code:'PART'+i,description:'Parker',quantity:'1'})));
 await assert.rejects(()=>large.store.search('Parker'),/INVENTORY_SCAN_TOO_LARGE/);
 assert.equal(large.calls.length,1);
});


test('Approved-only paged search reports every matching row without hidden cutoff',async()=>{
 const {store,calls}=storeFor([good,also,bearing]);
 const first=await store.searchPage('Parker M700',{limit:1,offset:0});
 assert.deepEqual(first,{items:[good],totalMatches:2,offset:0,limit:1,hasMore:true,nextOffset:1,versionId:'9'});
 const second=await store.searchPage('Parker M700',{limit:1,offset:1,versionId:first.versionId});
 assert.deepEqual(second,{items:[also],totalMatches:2,offset:1,limit:1,hasMore:false,nextOffset:null,versionId:'9'});
 const empty=await store.searchPage('Parker 900A',{limit:5});
 assert.equal(empty.totalMatches,0);
 await assert.rejects(()=>store.searchPage('Parker',{offset:-1}),/INVALID_OFFSET/);
 await assert.rejects(()=>store.searchPage('Parker',{limit:101}),/INVALID_LIMIT/);
 assert.equal(calls.length,9,'Invalid pagination rejected without additional DB query');
 await assert.rejects(()=>store.searchPage('Parker',{limit:1,offset:1,versionId:'8'}),/INVENTORY_VERSION_CHANGED_RESTART_SEARCH/);
 assert.equal(calls.length,10,'Wrong snapshot rejects before scanning item rows');
});

test('Concurrent Owner approval invalidates paged search rather than mixing two stock versions',async()=>{
 let reads=0;
 const pool={connect(){throw Error('NO_WRITE')},async query(sql){
  if(sql.includes('FROM inv_lab.active a LEFT JOIN inv_lab.versions')){
   reads++;return {rows:[{versionId:reads===1?'9':'10',generation:String(reads)}]};
  }
  assert.match(sql,/v\.status='current' AND v\.sealed=true/);
  return {rows:[good]};
 }};
 const store=new PostgresInventoryStore({pool,privateFiles:{putObject(){throw Error('NO_UPLOAD')},deleteObject(){throw Error('NO_DELETE')}}});
 await assert.rejects(()=>store.searchPage('Parker',{limit:1}),/INVENTORY_VERSION_CHANGED_RESTART_SEARCH/);
 assert.equal(reads,2);
});
