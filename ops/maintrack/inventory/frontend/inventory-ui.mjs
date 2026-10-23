import {createInventoryClient} from './inventory-client.mjs';
const section=document.getElementById('inventory'),frame=document.getElementById('inv47Frame'),status=document.getElementById('inv47State');
const readSession=()=>typeof S==='undefined'?null:S;
const client=createInventoryClient({endpoint:'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-inventory-047-qa',readSession});
let mountedToken=null;
function active(){if(!readSession()?.token||section.style.display!=='block')throw Error('UNAUTHENTICATED');}
// Trusted same-origin page receives only results/methods. Credentials stay in the host.
window.MainTrackInventoryHost=Object.freeze({
 role:()=>{active();return readSession().role;},
 snapshot:()=>{active();return client.snapshot();},
 version:()=>{active();return client.version();},
 upload:file=>{active();return client.upload(file);},
 review:id=>{active();return client.review(id);},
 publish:args=>{active();return client.publish(args);},
 history:()=>{active();return client.history();},
 restore:id=>{active();return client.restore(id);}
});
function size(){if(mountedToken)frame.style.height=Math.max(320,window.innerHeight-Math.max(0,section.getBoundingClientRect().top))+'px';}
function visibility(){
 const token=readSession()?.token;
 if(section.style.display!=='block'||!token){
  mountedToken=null;client.reset();frame.removeAttribute('src');frame.hidden=true;status.hidden=false;return;
 }
 if(token!==mountedToken){
  client.reset();mountedToken=token;status.hidden=true;frame.hidden=false;frame.src='inventory-reference.html';size();
 }
}
new MutationObserver(visibility).observe(section,{attributes:true,attributeFilter:['style']});
window.addEventListener('resize',size);visibility();
