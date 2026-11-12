import {createHash} from 'node:crypto';
// Operator-side reconciliation. No HTTP route, automatic retry or delete capability.
// Scope must come from the reviewed owned-resource manifest, never a client body.
export async function reconcileUpload({store,privateFiles,scope}){
 if(!store?.quarantineUpload||!privateFiles?.getObject)throw Error('PRIVATE_RECONCILIATION_PORTS_REQUIRED');
 const proof=await store.quarantineUpload(scope);
 const boundary={journalBlocksNewReservations:!proof.referenced,cleanupVerified:false};
 let bytes;try{bytes=await privateFiles.getObject({key:scope.storageKey});}catch{return {...proof,...boundary,status:'OBJECT_OUTCOME_UNVERIFIED',operatorHoldRequired:true};}
 if(!Buffer.isBuffer(bytes)||bytes.length>10*1024*1024||createHash('sha256').update(bytes).digest('hex')!==scope.fileSha256)return {...proof,...boundary,status:'OBJECT_HASH_MISMATCH',operatorHoldRequired:true};
 return {...proof,...boundary,status:proof.referenced?'CONSISTENT_ATTACHED':'QUARANTINED_OBJECT_RETAINED',operatorHoldRequired:!proof.referenced};
}
