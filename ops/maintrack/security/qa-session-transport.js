// Public QA routing only. The server retains its private window capability.
(function(scope){
 'use strict';
 const host='maintrack-registered-isolated-qa.vercel.app',qa='szhstrafzkxzstjdcynl.supabase.co';
 if(!['https://'+host,'https://localhost'].includes(scope.location.origin))throw Error('QA_CLIENT_ORIGIN_DENIED');
 if(scope.MainTrackQaSessionTransport)throw Error('QA_TRANSPORT_ALREADY_INSTALLED');
 const original=scope.fetch.bind(scope),routes=new Map([
  ['https://'+qa+'/functions/v1/maintrack-security-qa-final/api','https://'+host+'/api/core'],
  ['https://'+qa+'/functions/v1/maintrack-security-qa-inventory','https://'+host+'/api/inventory']
 ]);
 scope.fetch=function(input,options){
  const url=typeof input==='string'?input:input?.url;
  if(routes.has(url)){
   if(typeof input!=='string')throw Error('QA_EXPLICIT_REQUEST_REQUIRED');
   return original(routes.get(url),{...options,redirect:'error',cache:'no-store',credentials:'omit'});
  }
  if(typeof url==='string'&&/\.supabase\.co(?:\/|$)/i.test(url))throw Error('QA_UNREVIEWED_BACKEND_DENIED');
  return original(input,options);
 };
 Object.defineProperty(scope,'MainTrackQaSessionTransport',{value:Object.freeze({projectRef:'szhstrafzkxzstjdcynl',gatewayHost:host}),writable:false,configurable:false});
})(globalThis);
