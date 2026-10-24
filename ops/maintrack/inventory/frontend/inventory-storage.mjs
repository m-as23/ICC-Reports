// One account-scoped local record. Tokens and search history never enter storage.
export function createInventoryStorage({indexedDB=globalThis.indexedDB,stamp='inventory-v1',database='maintrack-inventory-cache-v1'}={}){
 let connection=null,queue=Promise.resolve();
 const open=()=>connection??=(new Promise(resolve=>{
  if(!indexedDB)return resolve(null);let request,done=false;
  const finish=db=>{if(done){db?.close();return}done=true;clearTimeout(timer);resolve(db)};
  const timer=setTimeout(()=>finish(null),2000);
  try{request=indexedDB.open(database,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('current'))request.result.createObjectStore('current')};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null};finish(db)};request.onerror=()=>finish(null);request.onblocked=()=>finish(null)}catch{finish(null)}
 })).then(db=>{if(!db)connection=null;return db});
 function run(action){const job=queue.then(async()=>{try{const db=await open();return db?await action(db):null}catch{return null}});queue=job.catch(()=>{});return job;}
 function transaction(db,mode,action){return new Promise(resolve=>{let tx,result=null,done=false;const finish=value=>{if(!done){done=true;clearTimeout(timer);resolve(value)}};const timer=setTimeout(()=>{try{tx?.abort()}catch{}finish(null)},5000);try{tx=db.transaction('current',mode);action(tx.objectStore('current'),value=>result=value);tx.oncomplete=()=>finish(result);tx.onabort=tx.onerror=()=>finish(null)}catch{finish(null)}})}
 return Object.freeze({
  read:account=>run(db=>transaction(db,'readonly',(store,set)=>{const request=store.get('current');request.onsuccess=()=>{const entry=request.result;if(entry?.account===account&&entry?.stamp===stamp)set(entry.payload)}})),
  write:(account,payload,valid=()=>true)=>run(db=>{if(!valid())return null;return transaction(db,'readwrite',store=>store.put({account,stamp,payload},'current'))}),
  clear:()=>run(db=>transaction(db,'readwrite',store=>store.clear()))
 });
}
