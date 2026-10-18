// Stage21: isolated static Web QA snapshot. Never touches production deploy/OTA metadata.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(dir,'../../../../');
const source=path.join(repo,'web/maintrack/public');
const target=path.resolve(dir,'../../stage21-web-qa');
const apiProd='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const apiQa='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
if(!fs.existsSync(path.join(source,'index.html')))throw Error('MISSING_MAINTRACK_SOURCE');
fs.rmSync(target,{force:true,recursive:true});
fs.cpSync(source,target,{recursive:true});
function replaceSingle(file,oldValue,newValue){
  const data=fs.readFileSync(file,'utf8');
  if(data.split(oldValue).length!==2)throw Error('UNEXPECTED_SOURCE: '+path.basename(file));
  fs.writeFileSync(file,data.replace(oldValue,newValue));
}
const script=path.join(target,'secure-assets/index-inline-1.js');
replaceSingle(script,apiProd,apiQa);
const index=path.join(target,'index.html');
let html=fs.readFileSync(index,'utf8');
const badge='<div role="note" aria-label="Pilot demo system"';
const first=html.indexOf(badge);
if(first<0)throw Error('SOURCE_PILOT_OVERLAY_NOT_FOUND');
const close=html.indexOf('</div>',first);
if(close<0||html.indexOf(badge,close)>=0)throw Error('PILOT_OVERLAY_UNEXPECTED');
html=html.slice(0,first)+html.slice(close+6);
if(html.includes('🧪 PILOT — بلاغات تجريبية فقط'))throw Error('PILOT_OVERLAY_REMAINING');
fs.writeFileSync(index,html);
// The preview must be visibly distinct in browser, even without owner login.
fs.writeFileSync(path.join(target,'qa-preview.txt'),'QA ONLY — MainTrack stage21. Not Production or signed OTA.\n');
const js=fs.readFileSync(script,'utf8');
if(!js.includes(apiQa)||js.includes(apiProd))throw Error('BACKEND_IS_NOT_QA');
if(!html.includes('id="otKind"')||html.indexOf('id="otKind"')>html.indexOf('id="otWorkKind"'))throw Error('COMPENSATION_NOT_FIRST');
if(!html.includes('اختر نوع التعويض'))throw Error('EXPLICIT_COMPENSATION_CHOICE_MISSING');
if(!js.includes('approval-card--compact')||!js.includes('approvalCompleted('))throw Error('RESOLVED_CARDS_MISSING');
if(!fs.existsSync(path.join(target,'secure-assets/index-inline-1.css')))throw Error('STYLES_MISSING');
console.log('STAGE21_WEB_QA_PREVIEW_READY: QA backend, no Pilot, mandatory compensation, compact approvals');
