// Browser bridge for the local registered-admission candidate. No key generation,
// key export, token storage, or password-only downgrade. Unsupported clients stop.
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
function requestOptions(options,create){const x=structuredClone(options);x.challenge=bytes(x.challenge);if(create)x.user.id=bytes(x.user.id);for(const key of ['allowCredentials','excludeCredentials'])if(x[key])x[key]=x[key].map(c=>({...c,id:bytes(c.id)}));return x;}
// Turnstile/network I/O may finish after the tab loses focus. Never invoke the
// native credential prompt in the background or manufacture focus/activation.
export function waitForWebAuthnForeground({document=globalThis.document,scope=globalThis.window,timeoutMs=15000}={}){
 if(!document)return Promise.resolve(); // Non-browser test/native adapters.
 if(typeof document.hasFocus!=='function'||!scope?.addEventListener||!document.addEventListener||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)return Promise.reject(Error('WEBAUTHN_FOREGROUND_REQUIRED'));
 const ready=()=>document.visibilityState==='visible'&&document.hasFocus();
 if(ready())return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);scope.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);error?reject(Error('WEBAUTHN_FOREGROUND_REQUIRED')):resolve();};
  const check=()=>{if(ready())finish(false);};
  const timer=setTimeout(()=>finish(true),timeoutMs);
  scope.addEventListener('focus',check);document.addEventListener('visibilitychange',check);check();
 });
}
export function createRegisteredClient({endpoint,fetchImpl=fetch,credentials=navigator.credentials,ingressProof}={}){
 if(!endpoint||typeof ingressProof!=='function'||!credentials?.create||!credentials?.get)throw Error('REGISTERED_CLIENT_CONFIGURATION');
 async function send(body){const response=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(await ingressProof(body)),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('REGISTERED_LOGIN_REJECTED');return response.json();}
 const proof=c=>{if(!c||typeof c.toJSON!=='function')throw Error('WEBAUTHN_JSON_SUPPORT_REQUIRED');return c.toJSON();};
 return {
  async enroll(code,invitation){const base={action:'login',code,identity:{phase:'enroll-options',invitation}};const start=await send(base);await waitForWebAuthnForeground();const credential=await credentials.create({publicKey:requestOptions(start.options,true)});return send({action:'login',code,identity:{phase:'enroll-finish',invitation,ticket:start.ticket,response:proof(credential)}});},
  async login(code,pw){const start=await send({action:'login',code,pw,identity:{phase:'login-options'}});await waitForWebAuthnForeground();const credential=await credentials.get({publicKey:requestOptions(start.options,false)});return send({action:'login',code,pw,identity:{phase:'login-finish',ticket:start.ticket,response:proof(credential)}});}
 };
}

export function installRegisteredClient({scope=window,endpoint,allowedGatewayHost,enabled=false,...options}={}){
 if(enabled!==true||typeof scope.MainTrackLoginProof!=='function'||typeof scope.MainTrackGatewayLogin!=='function')throw Error('REGISTERED_CLIENT_NOT_ACTIVATED');
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.hostname!==allowedGatewayHost||url.pathname!=='/api/login'||url.username||url.password||url.search||url.hash)throw Error('REGISTERED_GATEWAY_SCOPE');
 const client=createRegisteredClient({...options,endpoint:url.href,ingressProof:body=>body.identity.phase==='login-options'?Promise.resolve(body):scope.MainTrackLoginProof(body)});
 scope.MainTrackGatewayLogin=body=>{if(body?.action!=='login')throw Error('REGISTERED_LOGIN_ONLY');return client.login(body.code,body.pw);};
 // Enrollment is explicit; no silent new credential, local credential store or UI change.
 scope.MainTrackRegisteredEnrollment=(code,invitation)=>client.enroll(code,invitation);
}
