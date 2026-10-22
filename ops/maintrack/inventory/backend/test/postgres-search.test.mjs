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
 async query(sql,params){calls.push({sql,params});return {rows};}};
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
