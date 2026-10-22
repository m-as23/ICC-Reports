// MT-01 / CP-06 — server-only candidate, never imported by browser or APK.
// No route, secret, database or storage connection is created at module import.
// Binding a route or deployment requires a separate, reviewed Staging change.
import {createMainTrackOpaqueSessionVerifier} from './maintrack-session-adapter.mjs';
import {createReviewInventoryRuntime} from './create-review-runtime.mjs';
import {createInventoryHttpHandler} from './http-adapter.mjs';

export async function createReviewInventoryHttpHandler({
  pool,storage,bucket,allowedOrigins
}={}){
  if(!pool?.query||!pool?.connect)throw Error('PRIVATE_POSTGRES_POOL_REQUIRED');
  // Sessions always resolved from MainTrack's actual, server-side
  // mt_sessions/mt_users tables. No caller-supplied authorization callback.
  const verifySession=createMainTrackOpaqueSessionVerifier({pool});
  const runtime=await createReviewInventoryRuntime({
    verifySession,pool,storage,bucket
  });
  return createInventoryHttpHandler({service:runtime.service,allowedOrigins});
}
