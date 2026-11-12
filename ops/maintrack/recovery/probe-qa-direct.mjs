// Bounded TCP reachability only. No credentials, PostgreSQL login or TLS claim.
import dns from 'node:dns/promises';import net from 'node:net';import {fileURLToPath} from 'node:url';import path from 'node:path';
const HOST='db.szhstrafzkxzstjdcynl.supabase.co';
const connect=address=>new Promise(resolve=>{const s=net.createConnection({host:address,port:5432});let settled=false;const finish=(reachable,error)=>{if(settled)return;settled=true;s.destroy();resolve({address,reachable,error});};s.setTimeout(2500,()=>finish(false,'TCP_TIMEOUT'));s.once('connect',()=>finish(true,null));s.once('error',e=>finish(false,/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'TCP_FAILED'));});
export async function probeDirect({resolve4=()=>dns.resolve4(HOST),resolve6=()=>dns.resolve6(HOST),attempt=connect}={}){
 let timer;const report={projectRef:'szhstrafzkxzstjdcynl',host:HOST,port:5432,credentialsUsed:false,tls:'NOT TESTED',reachable:false,attempts:[]};
 try{
  const records=await Promise.race([Promise.allSettled([resolve4(),resolve6()]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS_TIMEOUT')),5000);})]);
  const addresses=[...new Set(records.flatMap(r=>r.status==='fulfilled'?r.value:[]))].filter(a=>net.isIP(a)).slice(0,2);
  if(!addresses.length){report.error='DIRECT_DNS_NO_ADDRESS';return report;}
  for(const address of addresses){const r=await attempt(address);report.attempts.push(r);if(r.reachable){report.reachable=true;break;}}
  if(!report.reachable)report.error='DIRECT_NETWORK_UNREACHABLE';return report;
 }catch{report.error='DIRECT_DNS_FAILED_OR_TIMEOUT';return report;}finally{clearTimeout(timer);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await probeDirect(),null,2));
