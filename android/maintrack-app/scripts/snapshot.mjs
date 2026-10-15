import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const base='https://maintrack-final-security-qa.vercel.app/';
const temp=path.join(root,'.snapshot-temp');
const www=path.join(root,'www');
const fingerprint=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest={sourceUrl:base,sourceDeployment:'dpl_ARyE7KNjFKMfJCWQ4YcZZMXxykhF',assets:[]};
function isSafe(x){return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(x)&&!x.includes('..')&&!x.startsWith('/')}
async function download(name){
 if(!isSafe(name))throw Error('Unsafe asset path '+name);
 const url=new URL(name,base);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 try {
  const r=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'cache-control':'no-cache'}});
  if(!r.ok||new URL(r.url).origin!==new URL(base).origin)throw Error('Source asset unavailable '+name+' status '+r.status);
  const content=Buffer.from(await r.arrayBuffer());
  if(!content.length||content.length>4000000)throw Error('Bad size '+name);
  const target=path.join(temp,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);
  manifest.assets.push({path:name,sha256:fingerprint(content),bytes:content.length});
  return content;
 }finally{clearTimeout(timer)}
}
await fs.rm(temp,{recursive:true,force:true});await fs.mkdir(temp,{recursive:true});
try{
 const r=JSON.parse((await download('security-build-report.json')).toString());
 if(r.strictScriptCSP!==true||r.apiEndpoint!=='stage9-isolated'||!Array.isArray(r.issues)||r.issues.length||r.rewrittenApiReferences<1)throw Error('SECURITY_REPORT_MISMATCH');
 const pages=Object.entries(r.pages||{});
 if(!pages.some(([name])=>name==='index.html'))throw Error('Missing MainTrack index');
 const resources=new Set(['index.html','v6.js','v6-core.js','v6.css','v6-core.css','bd-192.png','bd-512.png','manifest.webmanifest']);
 for(const [name,info] of pages){
  if(info.remainingInlineScripts||info.inlineEventHandlers||info.javascriptURLs||info.remainingInlineStyles)throw Error('Insecure page '+name);
  resources.add(name);
  for(const src of info.externalScriptSrcs||[])if(!src.startsWith('https://')&&!src.startsWith('//'))resources.add(src);
  for(let i=1;i<=Number(info.stylesExternalized||0);i++)resources.add('secure-assets/'+name.replace(/\.html$/,'')+'-inline-'+i+'.css');
 }
 for(const item of resources)await download(item);
 const indexFile=path.join(temp,'index.html');
 let html=await fs.readFile(indexFile,'utf8');
 if(!/<head\b/i.test(html))throw Error('Missing HTML head');
 const csp=["default-src 'self'","script-src 'self'","script-src-attr 'none'","style-src 'self' https://fonts.googleapis.com","style-src-attr 'unsafe-inline'","font-src 'self' https://fonts.gstatic.com data:","img-src 'self' data: blob: https:","connect-src 'self' https://tdnkeskczcsukcujwinu.supabase.co","worker-src 'self' blob:","media-src 'self' blob: data:","base-uri 'none'","object-src 'none'","form-action 'self'","upgrade-insecure-requests"].join('; ');
 html=html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,'');
 html=html.replace(/(<head[^>]*>)/i,'$1\n<meta http-equiv="Content-Security-Policy" content="'+csp+'">');
 if(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html))throw Error('Inline JS forbidden');
 const script=await fs.readFile(path.join(temp,'secure-assets/index-inline-1.js'),'utf8');
 if(!script.includes('maintrack-stage9-security-api/api')||script.includes('maintrack-stage6-api/api'))throw Error('Wrong API endpoint');
 await fs.writeFile(indexFile,html);
 manifest.nativeIndex={sha256:fingerprint(Buffer.from(html)),bytes:Buffer.byteLength(html)};
 const total=manifest.assets.reduce((sum,i)=>sum+i.bytes,0);
 const js=manifest.assets.filter(x=>x.path.endsWith('.js')).reduce((sum,x)=>sum+x.bytes,0);
 if(total>4000000||js>800000)throw Error('Asset size budget exceeded');
 await fs.rm(www,{recursive:true,force:true});await fs.rename(temp,www);
 await fs.writeFile(path.join(root,'snapshot.lock.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('SOURCE AUDIT OK: '+manifest.assets.length+' assets, bytes='+total+', js='+js+', SHA256 recorded');
}catch(e){await fs.rm(temp,{recursive:true,force:true});console.error(e);process.exitCode=1}
