// QA transport only. No deployment, provisioning, secrets persistence or cleanup.
import fs from 'node:fs';
const origin='https://szhstrafzkxzstjdcynl.supabase.co';
const functionPath='/functions/v1/maintrack-isolated-e2e-b2';
const contract=JSON.parse(fs.readFileSync(new URL('../../ops/maintrack/production-api-contract.json',import.meta.url),'utf8'));
const actions=new Set(['login',...contract.requiredActions]);
const hardCaps={requestLimit:80,runtimeMs:300000,timeoutMs:10000,requestBytes:16384,responseBytes:65536,totalBytes:8388608};
const fail=code=>{throw new Error(code);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export class BoundedQaClient {
 #base;#transport;#limits;#start=performance.now();#last=-Infinity;#tail=Promise.resolve();#stopped=null;#requests=0;#bytes=0;#audit=[];
 constructor(options={}){
  let u;try{u=new URL(options.baseUrl??origin+functionPath);}catch{fail('QA_TARGET');}
  if(u.origin!==origin||u.pathname!==functionPath||u.username||u.password||u.search||u.hash)fail('QA_TARGET');
  this.#base=u.toString();this.#transport=options.transport??fetch;this.#limits={};
  for(const [name,max] of Object.entries(hardCaps)){
   const n=options[name]??max;if(!Number.isSafeInteger(n)||n<=0||n>max)fail('QA_LIMIT');this.#limits[name]=n;
  }
 }
 request(route,options={}){
  let snapshot,snapshotError=false;
  try{snapshot={data:options.body===undefined?undefined:JSON.stringify(options.body),token:options.token,expectedStatus:options.expectedStatus,origin:options.origin};}catch{snapshotError=true;}
  const result=this.#tail.then(()=>this.#request(route,snapshot,snapshotError));
  this.#tail=result.catch(()=>{});return result;
 }
 async #request(route,{data,token,expectedStatus=200,origin:requestOrigin='http://127.0.0.1:43127'}={},snapshotError=false){
  if(this.#stopped)fail('QA_RUN_STOPPED');
  let reader,controller,timer;
  try{
   if(snapshotError)fail('QA_REQUEST_SERIALIZATION');
   const body=data===undefined?undefined:JSON.parse(data);
   if(!['readyz','api'].includes(route)||(route==='api'&&!actions.has(body?.action))||(route==='readyz'&&data!==undefined))fail('QA_ROUTE_OR_ACTION');
   if(!Number.isSafeInteger(expectedStatus)||expectedStatus<100||expectedStatus>599)fail('QA_EXPECTATION');
   if(typeof requestOrigin!=='string')fail('QA_REQUEST_ORIGIN');
   const sent=data?Buffer.byteLength(data):0;
   if(sent>this.#limits.requestBytes)fail('QA_REQUEST_BYTES');
   if(this.#bytes+sent>this.#limits.totalBytes)fail('QA_TOTAL_BYTES');
   if(token!==undefined&&(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)))fail('QA_TOKEN_FORMAT');
   if(this.#requests>=this.#limits.requestLimit)fail('QA_REQUEST_CAP');
   const gap=500-(performance.now()-this.#last);if(gap>0)await sleep(gap);
   const remaining=this.#limits.runtimeMs-(performance.now()-this.#start);
   if(remaining<=0)fail('QA_RUNTIME_CAP');
   this.#last=performance.now();this.#requests++;this.#bytes+=sent;
   const audit={route,action:route==='api'?body.action:null,status:null,requestBytes:sent,responseBytes:0};this.#audit.push(audit);
   controller=new AbortController();
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('QA_TIMEOUT'));},Math.min(this.#limits.timeoutMs,remaining));});
   const operation=(async()=>{
    const headers={'x-maintrack-qa-run-id':'B2_20261021',origin:requestOrigin};
    if(data)headers['content-type']='application/json';if(token)headers.authorization='Bearer '+token;
    const response=await this.#transport(this.#base+'/'+route,{method:route==='api'?'POST':'GET',body:data,headers,redirect:'manual',signal:controller.signal});
    if(controller.signal.aborted)fail('QA_TIMEOUT');audit.status=response.status;
    if(response.status>=300&&response.status<400)fail('QA_REDIRECT_DENIED');
    if(response.status!==expectedStatus||(response.status>=500&&!(route==='readyz'&&response.status===503&&expectedStatus===503)))fail('QA_UNEXPECTED_STATUS');
    const chunks=[];reader=response.body?.getReader();
    if(reader)for(;;){
     const {done,value}=await reader.read();if(controller.signal.aborted)fail('QA_TIMEOUT');if(done)break;
     audit.responseBytes+=value.byteLength;this.#bytes+=value.byteLength;
     if(audit.responseBytes>this.#limits.responseBytes)fail('QA_RESPONSE_BYTES');
     if(this.#bytes>this.#limits.totalBytes)fail('QA_TOTAL_BYTES');chunks.push(Buffer.from(value));
    }
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('QA_RESPONSE_JSON');}
   })();
   return await Promise.race([operation,timeout]);
  }catch(e){
   const code=controller?.signal.aborted?'QA_TIMEOUT':(/^QA_[A-Z_]+$/.test(e?.message??'')?e.message:'QA_TRANSPORT_FAILURE');
   this.#stopped=code;controller?.abort();if(reader)try{void reader.cancel().catch(()=>{});}catch{}throw new Error(code);
  }finally{clearTimeout(timer);this.#last=performance.now();}
 }
 summary(){return {project:'szhstrafzkxzstjdcynl',requests:this.#requests,bytes:this.#bytes,stopped:this.#stopped,audit:this.#audit.map(x=>({...x}))};}
}
