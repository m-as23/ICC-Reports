// Explicit target selection only. Never inherit an arbitrary host/user from a service.
const REF='szhstrafzkxzstjdcynl';
export function requireBackendTls(data){
 if(data?.backendSsl!==true||!['TLSv1.2','TLSv1.3'].includes(data?.backendProtocol))throw Error('BACKEND_TLS_REQUIRED');
 return {backendSsl:true,backendProtocol:data.backendProtocol};
}
export function qaConnection(service,transport='direct') {
 if(!/^[A-Za-z0-9_.-]{1,80}$/.test(service||''))throw Error('INVALID_SERVICE_NAME');
 const targets={direct:`host=db.${REF}.supabase.co port=5432 user=postgres`,
  'qa-session-pooler':`host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.${REF}`};
 if(!Object.hasOwn(targets,transport))throw Error('INVALID_QA_TRANSPORT');
 return `service=${service} ${targets[transport]} hostaddr='' dbname=postgres sslmode=verify-full connect_timeout=8`;
}
