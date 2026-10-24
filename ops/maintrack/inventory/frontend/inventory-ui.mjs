import {createInventoryClient} from './inventory-client.mjs';
import {createInventoryStorage} from './inventory-storage.mjs';
const storage=createInventoryStorage({stamp:__MT_INVENTORY_ENGINE__});
const section=document.getElementById('inventory'),frame=document.getElementById('inv47Frame'),status=document.getElementById('inv47State');
const readSession=()=>typeof S==='undefined'?null:S;
const client=createInventoryClient({endpoint:'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa',readSession,onAuthFailure:()=>{if(typeof logout==='function')logout();else teardown()}});
let mountedToken=null,contextGeneration=0,wasVisible=false;
const identity=()=>{const s=readSession();return s?.token?[s.token,s.code,s.role].join('|'):null};
const cacheAccount=()=>{const s=readSession();if(!s?.code)throw Error('UNAUTHENTICATED');return 'tdnkeskczcsukcujwinu:'+s.code+':'+s.role};
function context(){if(!mountedToken||identity()!==mountedToken)throw Error('SESSION_CHANGED');return contextGeneration}
function notify(type){frame.contentWindow?.dispatchEvent(new Event(type))}
function active(){if(!readSession()?.token||section.style.display!=='block')throw Error('UNAUTHENTICATED');}
// Trusted same-origin page receives only results/methods. Credentials stay in the host.
window.MainTrackInventoryHost=Object.freeze({
 contextKey:context,
 isVisible:()=>section.style.display==='block'&&!document.hidden&&identity()===mountedToken,
 readCache:()=>{context();return storage.read(cacheAccount())},
 writeCache:payload=>{const expected=context(),account=cacheAccount();return storage.write(account,payload,()=>{try{return context()===expected}catch{return false}})},
 clearCache:()=>storage.clear(),
 role:()=>{active();return readSession().role;},
 snapshot:options=>{active();return client.snapshot(options);},
 capabilities:()=>{active();return client.capabilities();},
 assist:(input,options)=>{active();return client.assist(input,options);},
 version:options=>{active();return client.version(options);},
 upload:file=>{active();return client.upload(file);},
 review:id=>{active();return client.review(id);},
 publish:args=>{active();return client.publish(args);},
 history:()=>{active();return client.history();},
 versions:options=>{active();return client.versions(options);},
 activity:options=>{active();return client.activity(options);},
 exclude:input=>{active();return client.exclude(input);},
 reinstate:input=>{active();return client.reinstate(input);},
 restore:id=>{active();return client.restore(id);}
});
function size(){if(mountedToken)frame.style.height=Math.max(320,window.innerHeight-Math.max(0,section.getBoundingClientRect().top))+'px';}
function teardown(){++contextGeneration;mountedToken=null;wasVisible=false;client.reset();frame.removeAttribute('src');frame.hidden=true;status.hidden=false;void storage.clear();}
function visibility(){
 const token=identity(),visible=section.style.display==='block'&&!document.hidden;
 if(mountedToken&&token!==mountedToken)teardown();
 if(!token)return;
 if(!visible){if(wasVisible){wasVisible=false;notify('maintrack-inventory-hidden')}return;}
 if(token!==mountedToken){
  ++contextGeneration;client.reset();mountedToken=token;status.hidden=true;frame.hidden=false;frame.src='inventory-reference.html';wasVisible=true;size();
 }else if(!wasVisible){wasVisible=true;size();notify('maintrack-inventory-visible')}
}
// Preserve existing logout behavior and also remove the device copy even if inventory was not opened.
if(typeof logout==='function'){const original=logout;logout=function(...args){teardown();return original.apply(this,args)}}
document.addEventListener('visibilitychange',visibility);
new MutationObserver(visibility).observe(section,{attributes:true,attributeFilter:['style']});
window.addEventListener('resize',size);visibility();
