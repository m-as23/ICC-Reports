// Offline synthetic load probe: NOT a benchmark of Supabase/real phone/network.
// Detects false negatives and accidental O(N^2) regressions on approved snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {PostgresInventoryStore} from '../src/postgres-store.mjs';

test('3,920 synthetic item inventory: bilingual recall + exact pagination across repeated searches',async()=>{
 const synthetic=Array.from({length:3920},(_,i)=>({
  code:'PART-'+String(i+1).padStart(5,'0'),
  description:i%10===0?'Parker M700 inverter 65A 90L':'Cable tray 6mm '+i,
  quantity:String(i%14),
  location:'ROW-'+String(i%70),
  extra:{}
 }));
 let queries=0;
 const pool={
  connect(){throw Error('UNEXPECTED_WRITE')},
  async query(sql,params){
   queries++;
   assert.match(sql,/v\.status='current' AND v\.sealed=true/);
   assert.deepEqual(params,[30001]);
   return {rows:synthetic};
  }
 };
 const store=new PostgresInventoryStore({pool,privateFiles:{putObject(){throw Error('UNEXPECTED_UPLOAD')},deleteObject(){throw Error('UNEXPECTED_DELETE')}}});
 const latencies=[];
 const totalExpected=392;
 for(let round=0;round<30;round++){
  const start=performance.now();
  const resp=await store.searchPage(round%2?'انفرتر باركر':'Parker M700 65 أمبير',{limit:75,offset:(round%5)*75});
  latencies.push(performance.now()-start);
  assert.equal(resp.totalMatches,totalExpected,'All confirmed matches must remain visible');
  assert.equal(resp.items.length,round%5===4?75:75);
  assert(resp.items.every(x=>x.description.includes('65A')));
  assert.equal(resp.hasMore,true);
 }
 const p95=latencies.toSorted((a,b)=>a-b)[Math.ceil(latencies.length*0.95)-1];
 console.log('MT047 OFFLINE ONLY: rows='+synthetic.length+', queries='+queries+', p95_ms='+p95.toFixed(2)+', max_ms='+Math.max(...latencies).toFixed(2));
 assert.equal(queries,30);
 // Purposefully no hard network performance claim or fragile runner-specific cutoff.
});
