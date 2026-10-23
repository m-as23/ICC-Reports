// REVIEW-ONLY MainTrack 0.4.7; pinned upstream 07dbac0c2a63cf58336ae8a2df383cbcf9f283be; no live connection.
// This candidate deliberately fixes upstream literal-substring search.
// Private PostgreSQL inventory repository; never call with a browser database key.
import {randomUUID} from 'node:crypto';
import {inventoryTerms,matchesInventoryItem,filterConfirmedInventoryItems} from './search-normalizer.mjs';
export class PostgresInventoryStore {
 constructor({pool,privateFiles}){
  if(!pool?.connect||!privateFiles?.putObject||!privateFiles?.deleteObject)
    throw Error('PRIVATE_DATABASE_AND_FILE_STORE_REQUIRED');
  this.pool=pool;this.files=privateFiles;
 }
 async transaction(run){
  const db=await this.pool.connect();
  try{await db.query('BEGIN');const value=await run(db);await db.query('COMMIT');return value;}
  catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async current(){
  const r=await this.pool.query('SELECT a.current_version_id::text AS "versionId",a.generation::text AS "generation",v.approved_at AS "approvedAt",v.filename FROM inv_lab.active a LEFT JOIN inv_lab.versions v ON v.id=a.current_version_id WHERE a.singleton=true');
  if(!r.rows.length)throw Error('ACTIVE_POINTER_MISSING');
  return {...r.rows[0],generation:Number(r.rows[0].generation)};
 }
 async approvedRows(){
  // Read only sealed/current approved snapshot, never pending or archived.
  const MAX_APPROVED_ROWS=30000;
  const r=await this.pool.query(
   'SELECT i.code,i.description,i.quantity::text AS quantity,i.location,i.extra '+
   'FROM inv_lab.active a JOIN inv_lab.versions v ON v.id=a.current_version_id '+
   'JOIN inv_lab.items i ON i.version_id=v.id '+
   "WHERE a.singleton=true AND v.status='current' AND v.sealed=true "+
   'ORDER BY i.code LIMIT $1',
   [MAX_APPROVED_ROWS+1]
  );
  if(r.rows.length>MAX_APPROVED_ROWS)throw Error('INVENTORY_SCAN_TOO_LARGE');
  return r.rows;
 }
 async snapshot(){
  const before=await this.current();
  const items=await this.approvedRows();
  const after=await this.current();
  if(before.versionId!==after.versionId||before.generation!==after.generation)
   throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
  return {...before,items};
 }
 async search(term,limit=50){
  // Backward-compatible short list. For exhaustive counts/pages use searchPage.
  if(typeof term!=='string'||!term.trim())throw Error('INVALID_QUERY');
  inventoryTerms(term);
  const n=limit===undefined?50:Number(limit);
  if(!Number.isInteger(n)||n<1||n>100)throw Error('INVALID_LIMIT');
  return filterConfirmedInventoryItems(await this.approvedRows(),term,{limit:n});
 }
 async searchPage(term,{limit=50,offset=0,versionId}={}){
  // Never silently hide matches: return exact total and explicit next offset.
  if(typeof term!=='string'||!term.trim())throw Error('INVALID_QUERY');
  const terms=inventoryTerms(term);
  const n=limit===undefined?50:Number(limit);
  const start=offset===undefined?0:Number(offset);
  if(!Number.isInteger(n)||n<1||n>100)throw Error('INVALID_LIMIT');
  if(!Number.isInteger(start)||start<0||start>30000)throw Error('INVALID_OFFSET');
  // Pin all pages to one approved snapshot. A concurrent Owner publish must
  // return HTTP409 rather than silently skipping or duplicating stock rows.
  const before=await this.current();
  if(versionId!==undefined&&versionId!==before.versionId)
   throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
  const rows=await this.approvedRows();
  const after=await this.current();
  if(before.versionId!==after.versionId||before.generation!==after.generation)
   throw Error('INVENTORY_VERSION_CHANGED_RESTART_SEARCH');
  const all=rows.filter(item=>matchesInventoryItem(item,terms));
  const items=all.slice(start,start+n),hasMore=start+items.length<all.length;
  return {items,totalMatches:all.length,offset:start,limit:n,hasMore,
   nextOffset:hasMore?start+items.length:null,versionId:before.versionId};
 }
 async item(code){
  const r=await this.pool.query('SELECT i.code,i.description,i.quantity::text AS quantity,i.location,i.extra,i.version_id::text AS "versionId" FROM inv_lab.items i JOIN inv_lab.active a ON a.current_version_id=i.version_id WHERE i.code=$1',[String(code).normalize('NFKC').trim().toUpperCase()]);
  return r.rows[0]||null;
 }
 async stage({items,filename,fileSha256,buffer,actor}){
  const storageKey='inventory/imports/'+randomUUID()+'.xlsx';
  await this.files.putObject({key:storageKey,bytes:buffer,sha256:fileSha256});
  try{
   return await this.transaction(async db=>{
    const live=await db.query('SELECT current_version_id::text AS id FROM inv_lab.active WHERE singleton=true');
    const baseId=live.rows[0]?.id??null;
    const v=await db.query('INSERT INTO inv_lab.versions(parent_version_id,file_sha256,filename,file_storage_key,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text AS id',[baseId,fileSha256,filename,storageKey,actor]);
    const draftId=v.rows[0].id;
    for(let index=0;index<items.length;index+=250){
      const block=items.slice(index,index+250),parameters=[];
      const placeholders=block.map((item,position)=>{
        parameters.push(draftId,item.code,item.description,item.quantity,item.location,JSON.stringify(item.extra||{}));
        const offset=position*6;
        return '('+Array.from({length:6},(_,k)=>'$'+(offset+k+1)).join(',')+')';
      });
      await db.query('INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra) VALUES '+placeholders.join(','),parameters);
    }
    await db.query("INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor) VALUES('STAGED',$1,$2,$3)",[draftId,baseId,actor]);
    await db.query('SELECT inv_lab.seal_version($1,$2)',[draftId,actor]);
    return {draftId,baseVersionId:baseId};
   });
  }catch(e){await this.files.deleteObject({key:storageKey}).catch(()=>{});throw e;}
 }
 async diff(draftId){
  const r=await this.pool.query('SELECT id::text AS id,parent_version_id::text AS "baseVersionId",file_sha256 AS "fileSha256",status,item_count AS "itemCount",filename FROM inv_lab.versions WHERE id=$1',[draftId]);
  const v=r.rows[0];if(!v)throw Error('DRAFT_NOT_FOUND');
  if(v.status!=='pending')throw Error('DRAFT_NOT_PENDING');
  const current=await this.current();
  const changes=await this.pool.query('SELECT * FROM inv_lab.compare_version($1)',[draftId]);
  const details=changes.rows.map(x=>({code:x.code,type:x.change_type,
    before:x.old_description===null?null:{description:x.old_description,quantity:x.old_quantity===null?null:Number(x.old_quantity),location:x.old_location},
    after:x.new_description===null?null:{description:x.new_description,quantity:x.new_quantity===null?null:Number(x.new_quantity),location:x.new_location}}));
  const counts={NEW:0,CHANGED:0,ABSENT:0,UNCHANGED:0};
  for(const x of details)counts[x.type]++;
  const baseSize=counts.CHANGED+counts.ABSENT+counts.UNCHANGED;
  return {draftId,baseVersionId:v.baseVersionId,currentVersionId:current.versionId,fileSha256:v.fileSha256,
   filename:v.filename,total:Number(v.itemCount),counts,absentRatio:baseSize?counts.ABSENT/baseSize:0,
   requiresExplicitReview:baseSize>0&&counts.ABSENT/baseSize>0.1,details};
 }
 async publish(draftId,baseVersionId,actor){
  try{
   const q=await this.pool.query('SELECT inv_lab.publish_version($1,$2,$3)::text AS id',[draftId,baseVersionId,actor]);
   return {versionId:q.rows[0].id};
  }catch(e){if(e.code==='40001')throw Error('STALE_BASE_RECOMPARE_REQUIRED');throw e;}
 }
 async history(limit=100){
  const q=await this.pool.query("SELECT id::text,parent_version_id::text AS \"parentVersionId\",source_version_id::text AS \"sourceVersionId\",filename,item_count AS \"itemCount\",status,approved_at AS \"approvedAt\",archived_at AS \"archivedAt\" FROM inv_lab.versions WHERE status IN ('current','archived') ORDER BY approved_at DESC LIMIT $1",[Math.max(1,Math.min(Number(limit)||100,500))]);
  return q.rows;
 }
 async stageRestore(sourceId,actor){
  return this.transaction(async db=>{
   const a=await db.query('SELECT current_version_id::text AS id FROM inv_lab.active WHERE singleton=true');
   const baseId=a.rows[0]?.id??null;
   const s=await db.query('SELECT file_sha256,file_storage_key,status FROM inv_lab.versions WHERE id=$1',[sourceId]);
   if(s.rows[0]?.status!=='archived')throw Error('ONLY_ARCHIVED_VERSION_CAN_BE_RESTORED');
   const src=s.rows[0];
   const v=await db.query('INSERT INTO inv_lab.versions(parent_version_id,source_version_id,filename,file_sha256,file_storage_key,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text AS id',[baseId,sourceId,'restore-v'+sourceId+'.xlsx',src.file_sha256,src.file_storage_key,actor]);
   const draftId=v.rows[0].id;
   await db.query('INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra) SELECT $1,code,description,quantity,location,extra FROM inv_lab.items WHERE version_id=$2',[draftId,sourceId]);
   await db.query("INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor,metadata) VALUES('RESTORE_REQUESTED',$1,$2,$3,jsonb_build_object('restoredFrom',$4::text))",[draftId,baseId,actor,sourceId]);
   await db.query('SELECT inv_lab.seal_version($1,$2)',[draftId,actor]);
   return {draftId,baseVersionId:baseId};
  });
 }
}
