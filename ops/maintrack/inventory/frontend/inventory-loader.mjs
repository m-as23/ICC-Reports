// Complete snapshots are committed atomically; search preparation remains authoritative.
export function createInventoryLoader({fetchSnapshot,prepareSnapshot,commit,context,validateVersion,getVersion,
 readCache=async()=>null,writeCache=async()=>{},clearCache=async()=>{},onState=()=>{},onError=()=>{}}){
 if([fetchSnapshot,prepareSnapshot,commit,context,validateVersion,onError].some(fn=>typeof fn!=='function'))throw Error('LOADER_CALLBACKS_REQUIRED');
 let epoch=0,pending=null,job=null,memory=null;
 const cancel=()=>{++epoch;pending?.abort();pending=null;job=null;};
 const complete=x=>Array.isArray(x?.data?.items)&&Array.isArray(x.rows)&&x.rows.length===x.data.items.length&&x.rows.length<=30000&&
  x.data.items.every((item,i)=>{const row=x.rows[i];return typeof item?.code==='string'&&row?.c===item.code&&typeof row.text==='string'&&typeof row.compactCode==='string'&&typeof row.kind==='string'&&Array.isArray(row.mt6Measures)&&row.mt6Measures.every(m=>typeof m?.k==='string'&&Number.isFinite(m.value))});
 const same=(a,b)=>a?.versionId===b?.versionId&&a?.generation===b?.generation;
 function load({reuse=false,force=false}={}){
  if(reuse&&!force&&job)return job;
  cancel();const generation=epoch,controller=new AbortController();pending=controller;
  let expected;
  const current=()=>{if(controller.signal.aborted||generation!==epoch)return false;try{return context()===expected}catch{return false}};
  const check=()=>{if(!current())throw new DOMException('Superseded inventory load','AbortError')};
  const safe=async fn=>{try{return await fn()}catch{return null}};
  const work=async()=>{
   try{
    expected=context();
    if(reuse&&!force&&!memory){const cached=await safe(readCache);check();if(complete(cached)){memory=cached;commit({...memory,cached:true});}}
    if(reuse&&memory&&!force&&getVersion){
     onState('checking');const version=await getVersion({signal:controller.signal});check();
     if(same(version,memory.data)){onState('ready');return {status:'reused'};}
    }
    onState(memory?'updating':'loading');
    const data=await fetchSnapshot({signal:controller.signal});check();
    if(!Array.isArray(data?.items)||data.items.length>30000)throw Error('INVALID_SNAPSHOT');
    const rows=await prepareSnapshot(data.items,{signal:controller.signal,background:!!memory});
    check();if(!Array.isArray(rows)||rows.length!==data.items.length)throw Error('INVALID_PREPARED_SNAPSHOT');
    const valid=await validateVersion(data,{signal:controller.signal});check();
    if(!valid)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
    memory={data,rows};commit({...memory,cached:false});onState('ready');
    await safe(()=>writeCache(memory));check();return {status:'committed'};
   }catch(error){
    if(!current())return {status:'superseded'};
    if(['AUTH','UNAUTHENTICATED','SESSION_CHANGED','FORBIDDEN','STALE_SESSION'].includes(error.message)){
     memory=null;await safe(clearCache);check();onError(error);return {status:'failed'};
    }
    if(reuse&&memory){onState('offline');return {status:'cached'};}
    onError(error);return {status:'failed'};
   }finally{if(generation===epoch){pending=null;job=null;}}
  };
  job=work();return job;
 }
 return Object.freeze({cancel,load});
}

// Dedicated same-origin worker: never receives session tokens or service keys.
export function prepareInWorker(rows,{signal,url='inventory-reference-worker.js',timeoutMs=60000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Cancelled','AbortError'));
  const worker=new Worker(url);let finished=false,timer;
  const finish=(error,result)=>{
   if(finished)return;finished=true;
   clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);
   if(error)reject(error);else resolve(result);
  };
  const abort=()=>finish(new DOMException('Cancelled','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{
   const result=event.data;
   if(result?.ok!==true||!Array.isArray(result.rows)||result.rows.length!==rows.length)return finish(Error('WORKER_PREPARATION_FAILED'));
   finish(null,result.rows);
  };
  worker.onerror=event=>{event.preventDefault();finish(Error('WORKER_PREPARATION_FAILED'));};
  timer=setTimeout(()=>finish(Error('WORKER_PREPARATION_TIMEOUT')),timeoutMs);
  try{worker.postMessage(rows);}catch{finish(Error('WORKER_PREPARATION_FAILED'));}
 });
}
