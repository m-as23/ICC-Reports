// Snapshot preparation is isolated from rendering and never writes stock.
export function createInventoryLoader({fetchSnapshot,prepareSnapshot,commit,context,validateVersion,onError=()=>{},}){
 if([fetchSnapshot,commit,context,onError,validateVersion].some(fn=>typeof fn!=='function')||typeof prepareSnapshot!=='function')throw Error('LOADER_CALLBACKS_REQUIRED');
 let epoch=0,pending;
 const cancel=()=>{++epoch;pending?.abort();pending=null;};
 return Object.freeze({cancel,async load(){
  cancel();const generation=epoch,controller=new AbortController();pending=controller;
  let expected;
  const current=()=>{
   if(controller.signal.aborted||generation!==epoch)return false;
   try{return context()===expected;}catch{return false;}
  };
  const check=()=>{if(!current())throw new DOMException('Superseded inventory load','AbortError');};
  try{
   expected=context();
   const data=await fetchSnapshot({signal:controller.signal});check();
   if(!Array.isArray(data?.items))throw Error('INVALID_SNAPSHOT');
   const rows=await prepareSnapshot(data.items,{signal:controller.signal});
   check();if(!Array.isArray(rows)||rows.length!==data.items.length)throw Error('INVALID_PREPARED_SNAPSHOT');
   const versionCurrent=await validateVersion(data,{signal:controller.signal});check();
   if(!versionCurrent)throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
   commit({data,rows});return {status:'committed'};
  }catch(error){
   if(!current())return {status:'superseded'};
   onError(error);return {status:'failed'};
  }finally{if(generation===epoch)pending=null;}
 }});
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
