import test from 'node:test';
import assert from 'node:assert/strict';
import {createSemanticSearch,documentForItem,allowsSemanticItem} from '../src/semantic-search.mjs';
import {createEmbeddingProvider} from '../src/embedding-provider.mjs';
import {createIndexWorker} from '../src/index-worker.mjs';
const vector=(a=1,b=0)=>[a,b,...Array(254).fill(0)];
const items=[{code:'T-J',description:'THERMOCOUPLE TYPE J',quantity:4},{code:'T-K',description:'THERMOCOUPLE TYPE K',quantity:2},{code:'PT100',description:'RTD PT100',quantity:3},{code:'L-1',description:'MECHANICAL LIMIT SWITCH',quantity:1},{code:'D-65',description:'DRIVE M700 65A',quantity:1},{code:'D-165',description:'DRIVE M700 165A',quantity:1}];
function fixture({ready=true,fail=false}={}){
 let version='2',claims=0,release=0,complete=0,saved=[],scheduled=[],pending=items;
 const store={snapshot:async()=>({versionId:version,items}),current:async()=>({versionId:version})};
 const index={status:async()=>({ready,indexed:ready?items.length:0,total:items.length}),claim:async()=>++claims===1?'lease':null,
  pending:async()=>pending,save:async(v,m,t,docs)=>{saved.push(...docs);pending=[];},finish:async()=>{ready=true;complete++;return true;},release:async()=>release++,nearest:async()=>items.map((x,i)=>({code:x.code,similarity:1-i*.01}))};
 const embed=Object.assign(async texts=>{if(fail)throw Error('provider');return texts.map(()=>vector());},{model:'test-model',dimensions:256});
 const assist=createSemanticSearch({store,index,embed,schedule:p=>scheduled.push(p),claim:async()=>true});
 return {assist,index,store,scheduled,setVersion:v=>version=v,get saved(){return saved;},get release(){return release;},get complete(){return complete;}};
}
test('semantic retrieval adds real codes across families without requiring a shared query word',async()=>{
 const f=fixture();const a=await f.assist.search({query:'حساس حرارة',versionId:'2',actor:'u'});
 assert.equal(a.mode,'semantic');assert.ok(a.codes.includes('T-J'));assert.ok(a.codes.includes('PT100'));
 f.index.nearest=async()=>[{code:'L-1',similarity:.8},{code:'invented',similarity:.99},{code:'T-J',similarity:.1}];
 assert.deepEqual((await f.assist.search({query:'نهاية مشوار ميكانيكي',versionId:'2',actor:'u'})).codes,['L-1']);
});
test('all explicit model, type and unit constraints survive semantic interpretation',()=>{
 assert.equal(allowsSemanticItem(items[0],'حساس حرارة type K'),false);assert.equal(allowsSemanticItem(items[1],'حساس حرارة type K'),true);
 assert.equal(allowsSemanticItem(items[5],'درايف M700 ٦٥ أمبير'),false);assert.equal(allowsSemanticItem(items[4],'درايف M700 ٦٥ أمبير'),true);
 assert.equal(allowsSemanticItem(items[2],'PT100'),true);assert.equal(allowsSemanticItem(items[1],'PT100'),false);
 for(const query of ['sensor normally open','حساس نورمال اوبن'])assert.equal(allowsSemanticItem({description:'INDUCTIVE SENSOR NC'},query),false);
 assert.equal(allowsSemanticItem({description:'MODEL XYZ 700'},'model ABC 700'),false);
});
test('multi-slice indexing schedules bounded continuation until all documents are ready',async()=>{
 let count=0,ready=false,clock=0;const scheduled=[];
 const index={claim:async()=> 'lease',prepare:async()=>{},pending:async()=>count<2?[documentForItem(items[count])]:[],save:async()=>count++,finish:async()=>ready=true,release:async()=>{}};
 let assist;assist=createSemanticSearch({store:{snapshot:async()=>({versionId:'2',items}),current:async()=>({versionId:'2'})},index,embed:Object.assign(async t=>t.map(()=>vector()),{model:'test-model'}),now:()=>{const t=clock;clock+=20000;return t;},schedule:p=>scheduled.push(p),continueIndex:async()=>assist.warm()});
 await assist.warm();for(let i=0;i<scheduled.length&&i<10;i++)await scheduled[i];assert.equal(count,2);assert.equal(ready,true);
});
test('unfinished index never pretends semantic success; warm schedules real indexing and reuses progress',async()=>{
 const f=fixture({ready:false});const r=await f.assist.search({query:'مفتاح مشوار',versionId:'2',actor:'u'});
 assert.equal(r.mode,'local');assert.equal(r.reason,'INDEXING');await Promise.all(f.scheduled);
 assert.equal(f.saved.length,items.length);assert.equal(f.complete,1);assert.equal(f.release,1);
 assert.equal((await f.assist.search({query:'مفتاح مشوار',versionId:'2',actor:'u'})).mode,'semantic');
});
test('failed embedding releases lease without marking partial data ready',async()=>{
 const f=fixture({ready:false,fail:true});await f.assist.warm();assert.equal(f.complete,0);assert.equal(f.release,1);
});
test('version changes discard completed remote results and reject old queries',async()=>{
 const f=fixture();f.index.nearest=async()=>{f.setVersion('3');return [{code:'T-K',similarity:.9}];};
 await assert.rejects(()=>f.assist.search({query:'حساس',versionId:'2',actor:'u'}),/INVENTORY_VERSION_CHANGED/);
 await assert.rejects(()=>f.assist.search({query:'حساس',versionId:'2',actor:'u'}),/INVENTORY_VERSION_CHANGED/);
});
test('documents exclude quantities, location and employee metadata, but cover every actual catalog field',()=>{
 const d=documentForItem({...items[0],location:'SECRET',extra:{brand:'Brand',model:'Model',employee:'PRIVATE'}});
 assert.match(d.text,/TYPE J/);assert.match(d.text,/Brand/);assert.doesNotMatch(d.text,/SECRET|PRIVATE|quantity/);
 assert.equal(d.hash,documentForItem({...items[0],quantity:999,extra:{brand:'Brand',model:'Model'}}).hash);
});
test('missing credentials stay local and never schedule a network call',async()=>{
 let calls=0;const a=createSemanticSearch({store:{snapshot:async()=>({versionId:'2',items})},schedule:()=>calls++});
 assert.deepEqual(a.capabilities(),{cloud:false,semantic:false});assert.equal((await a.search({query:'حرارة',versionId:'2',actor:'u'})).reason,'NOT_CONFIGURED');assert.equal(calls,0);
});
test('private index continuation accepts only internal server authentication and schedules one slice',async()=>{
 let initialized=0,warmed=0;const tasks=[];const handler=createIndexWorker({secret:'s'.repeat(64),initialize:async()=>{initialized++;return {warmIndex:async()=>warmed++};},schedule:p=>tasks.push(p)});
 assert.equal((await handler(new Request('https://service/index-worker',{method:'POST'}))).status,401);
 assert.equal((await handler(new Request('https://service/index-worker',{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(64),Origin:'https://localhost'}}))).status,403);
 assert.equal(initialized,0);assert.equal((await handler(new Request('https://service/index-worker',{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(64)}}))).status,202);await Promise.all(tasks);assert.equal(warmed,1);
});
test('recorded embedding outage is unavailable, rather than perpetual indexing',async()=>{
 const f=fixture({ready:false});f.index.status=async()=>({ready:false,error:'PROVIDER_UNAVAILABLE',indexed:0,total:6});assert.equal((await f.assist.search({query:'قطعة',versionId:'2',actor:'u'})).reason,'PROVIDER_UNAVAILABLE');await Promise.all(f.scheduled);
});
test('fixed embedding endpoint orders indexes and rejects malformed/nonfinite/wrong-sized vectors',async()=>{
 let sent;const embed=createEmbeddingProvider({apiKey:'server-test',fetchImpl:async(url,init)=>{sent={url,body:JSON.parse(init.body)};return {ok:true,json:async()=>({data:[{index:1,embedding:vector(0,1)},{index:0,embedding:vector()}]})};}});
 assert.equal((await embed(['first','second']))[0][0],1);assert.equal(sent.url,'https://api.openai.com/v1/embeddings');assert.equal(sent.body.dimensions,256);assert.equal(sent.body.model,'text-embedding-3-small');
 for(const bad of [[1,2],Array(256).fill(NaN),Array(256).fill(0)]){
  const broken=createEmbeddingProvider({apiKey:'server-test',fetchImpl:async()=>({ok:true,json:async()=>({data:[{index:0,embedding:bad}]})})});
  await assert.rejects(()=>broken(['one']),/INVALID_EMBEDDING/);
 }
});
