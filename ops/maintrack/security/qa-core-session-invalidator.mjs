// Trusted operator callback for the pinned QA/confirmed operational Core layouts.
// No connections, grants, API endpoints or schema selection from client input.
export function createCoreSessionInvalidator({projectRef,schema,operatorRole,sessionUser,expectedDatabase,allowedEmployeeCodes=[],allowedPrincipalIds=[]}={}){
 const qa=projectRef==='szhstrafzkxzstjdcynl'&&schema==='qa_security_final_20261025';
 const production=projectRef==='tdnkeskczcsukcujwinu'&&schema==='public';
 if((!qa&&!production)||![operatorRole,sessionUser,expectedDatabase].every(x=>typeof x==='string'&&/^[A-Za-z0-9_]{1,63}$/.test(x)))throw Error('QA_SESSION_OPERATOR_CONFIG_REQUIRED');
 if(qa&&(!Array.isArray(allowedEmployeeCodes)||!allowedEmployeeCodes.length||allowedEmployeeCodes.length>2||allowedEmployeeCodes.some(x=>!['90000001','90000002'].includes(x))))throw Error('QA_SESSION_OPERATOR_CONFIG_REQUIRED');
 if(production&&(!Array.isArray(allowedPrincipalIds)||!allowedPrincipalIds.length||allowedPrincipalIds.length>2||allowedPrincipalIds.some(x=>typeof x!=='string'||! /^[a-f0-9-]{36}$/.test(x))))throw Error('VERIFIED_PRODUCTION_PRINCIPALS_REQUIRED');
 // Principal IDs come from the trusted operator's reviewed two-account scope,
 // never from HTTP input or an Employee Code declaration. This does not grant authority.
 const allowed=new Set(qa?allowedEmployeeCodes:allowedPrincipalIds);
 return async(c,{principal,credentialId})=>{
  if(typeof principal!=='string'||! /^[a-f0-9-]{36}$/.test(principal)||(credentialId!==null&&(typeof credentialId!=='string'||!credentialId||credentialId.length>1400)))throw Error('QA_SESSION_INVALIDATION_SCOPE');
  const a=(await c.query('SELECT current_database() AS db,current_user AS role,session_user AS login')).rows[0];
  if(a?.db!==expectedDatabase||a?.role!==operatorRole||a?.login!==sessionUser)throw Error('QA_SESSION_OPERATOR_ATTESTATION');
  const user=(await c.query(`SELECT id,employee_code FROM ${schema}.mt_users WHERE id=$1 FOR UPDATE`,[principal])).rows[0];
  if(!user||!allowed.has(qa?user.employee_code:user.id))throw Error('QA_SESSION_OWNER_NOT_ALLOWED');
  if(credentialId!==null){
   const unknown=await c.query(`SELECT 1 FROM ${schema}.mt_sessions s WHERE s.user_id=$1 AND NOT EXISTS(SELECT 1 FROM mt_registered_identity.session_binding b WHERE b.token_hash=s.token_hash AND b.principal=$1) LIMIT 1`,[principal]);
   if(unknown.rowCount)throw Error('QA_LEGACY_SESSION_BINDING_UNRESOLVED');
   await c.query(`DELETE FROM ${schema}.mt_sessions s USING mt_registered_identity.session_binding b WHERE s.token_hash=b.token_hash AND s.user_id=$1 AND b.principal=$1 AND b.credential_id=$2`,[principal,credentialId]);
  }else{
   // Verified lost-device recovery must include pre-enrollment/unbound sessions.
   await c.query(`DELETE FROM ${schema}.mt_sessions WHERE user_id=$1`,[principal]);
  }
  await c.query('DELETE FROM mt_registered_identity.session_binding WHERE principal=$1 AND ($2::text IS NULL OR credential_id=$2)',[principal,credentialId]);
  return true;
 };
}

export function createQaCoreSessionInvalidator(options){
 if(options?.projectRef!=='szhstrafzkxzstjdcynl')throw Error('QA_SESSION_OPERATOR_CONFIG_REQUIRED');
 return createCoreSessionInvalidator(options);
}
