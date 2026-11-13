// Shared browser/WebView/Edge binding. No secret, storage or provider configuration.
export async function loginProofBinding(code,requestId){
 if(typeof code!=='string'||!/^\d{1,32}$/.test(code)||typeof requestId!=='string'||!/^[a-f0-9]{32}$/.test(requestId))throw Error('INVALID_LOGIN_PROOF_BINDING');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('maintrack-login-v1:'+code+':'+requestId));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function createLoginProofClient({obtainToken,randomId=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('')}={}){
 if(typeof obtainToken!=='function')throw Error('LOGIN_WIDGET_ADAPTER_REQUIRED');
 return async body=>{
  if(body.action!=='login')return body;
  const requestId=randomId(),cData=await loginProofBinding(body.code,requestId);
  // Only action and an opaque account/nonce digest go to the widget, never passwords.
  const token=await obtainToken({action:'maintrack_login',cData});
  if(typeof token!=='string'||!token||token.length>2048)throw Error('LOGIN_WIDGET_UNAVAILABLE');
  return {...body,admission:{token,requestId}};
 };
}
