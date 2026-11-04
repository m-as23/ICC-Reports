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

export function createGatewayLoginClient({authorize,gatewayUrl,allowedGatewayHost,fetchImpl=fetch}={}){
 let url;try{url=new URL(gatewayUrl);}catch{throw Error('QA_LOGIN_GATEWAY_REQUIRED');}
 if(typeof authorize!=='function'||url.protocol!=='https:'||url.hostname!==allowedGatewayHost||url.pathname!=='/api/login'||url.username||url.password||url.search||url.hash)throw Error('QA_LOGIN_GATEWAY_REQUIRED');
 return async body=>{
  if(body?.action!=='login')throw Error('LOGIN_ONLY_GATEWAY');
  const admitted=await authorize(body);const outgoing=Object.fromEntries(Object.entries(admitted).filter(([key])=>key!=='token'));
  const r=await fetchImpl(url.href,{method:'POST',redirect:'error',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(outgoing),signal:AbortSignal.timeout(10000)});
  const data=await r.json();if(!data||typeof data!=='object'||Array.isArray(data))throw Error('LOGIN_GATEWAY_RESPONSE');if(!r.ok&&!data.error)throw Error('LOGIN_GATEWAY_RESPONSE');return data;
 };
}
export function installLoginProofClient({scope=window,gatewayUrl,allowedGatewayHost,fetchImpl,...options}={}){
 if(scope.MainTrackLoginProof!==undefined||scope.MainTrackGatewayLogin!==undefined)throw Error('LOGIN_PROOF_CLIENT_ALREADY_INSTALLED');
 const authorize=createLoginProofClient({obtainToken:createTurnstileTokenProvider(options)});
 const gatewayLogin=createGatewayLoginClient({authorize,gatewayUrl,allowedGatewayHost,fetchImpl});
 scope.MainTrackLoginProof=authorize;scope.MainTrackGatewayLogin=gatewayLogin;
 return ()=>{if(scope.MainTrackLoginProof===authorize)delete scope.MainTrackLoginProof;if(scope.MainTrackGatewayLogin===gatewayLogin)delete scope.MainTrackGatewayLogin;};
}
