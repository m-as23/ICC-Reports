// REVIEW-ONLY v0.4.7 integration test: pinned upstream SpareParts-Search-Lab @ 07dbac0c2a63cf58336ae8a2df383cbcf9f283be.
// No Supabase / Vercel changes, no inventory database operations executed by this module alone.
// Server-side adapter modeled on MainTrack's existing mt_sessions / mt_users
// contract. Do not use Supabase Auth JWT or accept role/userId from JSON.
import {createHash} from 'node:crypto';

export function createMainTrackOpaqueSessionVerifier({pool}={}){
 if(!pool||typeof pool.query!=='function')throw Error('PRIVATE_POSTGRES_POOL_REQUIRED');
 return async function verifySession(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))return null;
  const hash=createHash('sha256').update(token.toLowerCase()).digest('hex');
  const result=await pool.query(
   'SELECT u.id::text AS "userId",u.role::text AS role,u.active,u.must_change AS "mustChange" '
   +'FROM public.mt_sessions s INNER JOIN public.mt_users u ON u.id=s.user_id '
   +'WHERE s.token_hash=$1 AND s.expires_at>now() '
   +'AND s.token_version=u.token_version AND u.active=true LIMIT 1',
   [hash]
  );
  const user=result.rows[0];
  if(!user || user.active!==true || user.mustChange===true)return null;
  if(!['owner','engineer','technician'].includes(user.role))return null;
  return {authenticated:true,active:true,role:user.role,userId:user.userId};
 };
}
