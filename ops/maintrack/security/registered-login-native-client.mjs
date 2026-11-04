// Credential Manager owns key material and native clientDataJSON. Nothing is stored here.
export function createNativeCredentials(bridge) {
 if(typeof bridge?.create!=='function'||typeof bridge?.get!=='function')throw Error('NATIVE_PASSKEY_UNAVAILABLE');
 const invoke=async(method,{publicKey}={})=>{
  if(!publicKey||typeof publicKey!=='object'||Object.hasOwn(publicKey,'origin')||Object.hasOwn(publicKey,'clientDataHash'))throw Error('NATIVE_PASSKEY_OPTIONS');
  const result=await bridge[method]({requestJson:JSON.stringify(publicKey)});
  let value;try{value=JSON.parse(result.responseJson);}catch{throw Error('NATIVE_PASSKEY_RESPONSE');}
  if(!value?.id||value.type!=='public-key'||!value.response?.clientDataJSON)throw Error('NATIVE_PASSKEY_RESPONSE');
  return Object.freeze({toJSON:()=>structuredClone(value)});
 };
 return Object.freeze({create:options=>invoke('create',options),get:options=>invoke('get',options)});
}

export function createRegisteredNativeClient({endpoint,fetchImpl=fetch,bridge,ingressProof}={}){
 const credentials=createNativeCredentials(bridge);
 if(!endpoint||typeof ingressProof!=='function')throw Error('REGISTERED_CLIENT_CONFIGURATION');
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.pathname!=='/api/login'||url.username||url.password||url.search||url.hash)throw Error('REGISTERED_GATEWAY_SCOPE');
 async function send(body){const response=await fetchImpl(url.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(await ingressProof(body)),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('REGISTERED_LOGIN_REJECTED');return response.json();}
 return Object.freeze({
  async enroll(code,invitation){const start=await send({action:'login',code,identity:{phase:'enroll-options',invitation}});const credential=await credentials.create({publicKey:start.options});return send({action:'login',code,identity:{phase:'enroll-finish',invitation,ticket:start.ticket,response:credential.toJSON()}});},
  async login(code,pw){const start=await send({action:'login',code,pw,identity:{phase:'login-options'}});const credential=await credentials.get({publicKey:start.options});return send({action:'login',code,pw,identity:{phase:'login-finish',ticket:start.ticket,response:credential.toJSON()}});}
 });
}

export function installRegisteredNativeClient({scope=window,endpoint,allowedGatewayHost,enabled=false,bridge=scope.Capacitor?.Plugins?.MainTrackPasskey,...options}={}){
 if(enabled!==true||typeof scope.MainTrackLoginProof!=='function'||typeof scope.MainTrackGatewayLogin!=='function')throw Error('REGISTERED_CLIENT_NOT_ACTIVATED');
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.hostname!==allowedGatewayHost||url.pathname!=='/api/login'||url.username||url.password||url.search||url.hash)throw Error('REGISTERED_GATEWAY_SCOPE');
 const client=createRegisteredNativeClient({...options,bridge,endpoint:url.href,ingressProof:body=>body.identity.phase==='login-options'?Promise.resolve(body):scope.MainTrackLoginProof(body)});
 scope.MainTrackGatewayLogin=body=>{if(body?.action!=='login')throw Error('REGISTERED_LOGIN_ONLY');return client.login(body.code,body.pw);};
 scope.MainTrackRegisteredEnrollment=(code,invitation)=>client.enroll(code,invitation);
}
