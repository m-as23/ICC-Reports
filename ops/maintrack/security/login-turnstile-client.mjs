import {createLoginProofClient} from '../../../supabase/functions/maintrack-final-047/login-proof.mjs';
// Web/Android WebView adapter; caller supplies public sitekey and loaded official widget.
// Does not inject third-party scripts or relax CSP automatically.
export function createTurnstileTokenProvider({widget,element,sitekey,timeoutMs=45000}={}){
 if(!widget||typeof widget.render!=='function'||typeof widget.execute!=='function'||typeof widget.remove!=='function'||!element||typeof sitekey!=='string'||sitekey.length<10||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('LOGIN_WIDGET_CONFIGURATION_REQUIRED');
 let pending=false;
 return async ({action,cData})=>{
  if(pending)throw Error('LOGIN_WIDGET_ALREADY_PENDING');pending=true;
  try{return await new Promise((resolve,reject)=>{
   let id,settled=false;const remove=()=>{if(id!==undefined){try{widget.remove(id);}catch{}}};
   const finish=(error,token)=>{if(settled)return;settled=true;clearTimeout(timer);remove();if(error)reject(Error('LOGIN_WIDGET_UNAVAILABLE'));else resolve(token);};
   const timer=setTimeout(()=>finish(true),timeoutMs);
   try{id=widget.render(element,{sitekey,action,cData,execution:'execute',appearance:'interaction-only',callback:token=>finish(false,token),'error-callback':()=>finish(true),'expired-callback':()=>finish(true),'timeout-callback':()=>finish(true)});if(settled)remove();else widget.execute(id);}catch{finish(true);}
  });}finally{pending=false;}
 };
}

export function installLoginProofClient({scope=window,...options}={}){
 if(scope.MainTrackLoginProof!==undefined)throw Error('LOGIN_PROOF_CLIENT_ALREADY_INSTALLED');
 const authorize=createLoginProofClient({obtainToken:createTurnstileTokenProvider(options)});
 scope.MainTrackLoginProof=authorize;
 return ()=>{if(scope.MainTrackLoginProof===authorize)delete scope.MainTrackLoginProof;};
}
