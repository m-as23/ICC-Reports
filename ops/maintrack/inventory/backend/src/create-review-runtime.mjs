// MainTrack 0.4.7 source candidate ONLY. Importing this module does not create
// routes, read env vars, connect to Supabase, or write to a database.
// A future protected server entry point must explicitly pass a trusted,
// server-side session verifier, a restricted PostgreSQL pool and PRIVATE storage.
import {parseInventoryXlsx} from './import-xlsx.mjs';
import {createPrivateBucketArchive} from './private-bucket.mjs';
import {PostgresInventoryStore} from './postgres-store.mjs';
import {createSemanticSearch} from './semantic-search.mjs';
import {createPostgresSemanticIndex} from './postgres-semantic-store.mjs';
import {createInventoryService} from './inventory-service.mjs';

export async function createReviewInventoryRuntime({verifySession,pool,storage,bucket,embed,schedule}={}){
 if(typeof verifySession!=='function'||!pool?.query||!pool?.connect)
  throw Error('TRUSTED_SESSION_AND_DB_REQUIRED');
 const privateFiles=await createPrivateBucketArchive({storage,bucket});
 const store=new PostgresInventoryStore({pool,privateFiles});
 return Object.freeze({
  service:createInventoryService({verifySession,store,parseXlsx:parseInventoryXlsx,assist:createSemanticSearch({store,index:createPostgresSemanticIndex({pool}),embed,schedule,claim:actor=>store.claimSearchBudget(actor)})}),
  // No raw storage bucket, database pool, credentials or unrestricted file method
  // is exposed to a client handler.
 });
}
