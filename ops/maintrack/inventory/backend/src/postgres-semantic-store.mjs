import {randomUUID} from 'node:crypto';
import {normalizedVector} from './embedding-provider.mjs';
export function createPostgresSemanticIndex({pool}){
 const lease=async(db,v,m,t)=>{const r=await db.query('SELECT 1 FROM inv_lab.semantic_versions WHERE version_id=$1 AND model=$2 AND token=$3 AND lease_until>now() FOR UPDATE',[v,m,t]);if(!r.rows.length)throw Error('INDEX_LEASE_LOST');};
 const tx=async fn=>{const db=await pool.connect();try{await db.query('BEGIN');const r=await fn(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}};
 return {
  async claim(v,m){const token=randomUUID();const q=await pool.query("INSERT INTO inv_lab.semantic_versions(version_id,model,token,lease_until) VALUES($1,$2,$3,now()+interval '90 seconds') ON CONFLICT(version_id,model) DO UPDATE SET token=$3,lease_until=now()+interval '90 seconds' WHERE NOT semantic_versions.ready AND (semantic_versions.lease_until IS NULL OR semantic_versions.lease_until<now()) AND (semantic_versions.retry_after IS NULL OR semantic_versions.retry_after<=now()) RETURNING token",[v,m,token]);return q.rows[0]?.token||null;},
  async prepare(v,m,t,docs){await tx(async db=>{
   await lease(db,v,m,t);
   for(let start=0;start<docs.length;start+=500){const batch=JSON.stringify(docs.slice(start,start+500).map(d=>({code:d.code,hash:d.hash})));
    await db.query('INSERT INTO inv_lab.semantic_documents(model,hash) SELECT DISTINCT $1,x.hash FROM jsonb_to_recordset($2::jsonb) x(hash text) ON CONFLICT DO NOTHING',[m,batch]);
    await db.query('INSERT INTO inv_lab.semantic_items(version_id,code,model,hash) SELECT $1,x.code,$2,x.hash FROM jsonb_to_recordset($3::jsonb) x(code text,hash text) ON CONFLICT DO NOTHING',[v,m,batch]);
   }
  });},
  async pending(v,m,docs,n){const q=await pool.query('SELECT i.code FROM inv_lab.semantic_items i JOIN inv_lab.semantic_documents d USING(model,hash) WHERE i.version_id=$1 AND i.model=$2 AND d.embedding IS NULL ORDER BY i.code LIMIT $3',[v,m,n]);const wanted=new Set(q.rows.map(x=>x.code));return docs.filter(d=>wanted.has(d.code));},
  async save(v,m,t,docs){await tx(async db=>{await lease(db,v,m,t);for(const d of docs)await db.query('UPDATE inv_lab.semantic_documents SET embedding=$3::extensions.vector WHERE model=$1 AND hash=$2 AND embedding IS NULL',[m,d.hash,JSON.stringify(normalizedVector(d.vector))]);});},
  async status(v,m){const q=await pool.query('SELECT s.ready,s.last_error AS error,v.item_count AS total,(SELECT count(*)::int FROM inv_lab.semantic_items i JOIN inv_lab.semantic_documents d USING(model,hash) WHERE i.version_id=v.id AND i.model=$2 AND d.embedding IS NOT NULL) AS indexed FROM inv_lab.versions v LEFT JOIN inv_lab.semantic_versions s ON s.version_id=v.id AND s.model=$2 WHERE v.id=$1',[v,m]);const r=q.rows[0]||{total:0,indexed:0};return {...r,ready:r.ready===true&&r.indexed===r.total};},
  async finish(v,m,t){return tx(async db=>{await lease(db,v,m,t);const q=await db.query('UPDATE inv_lab.semantic_versions s SET ready=true,last_error=NULL,failures=0,retry_after=NULL WHERE version_id=$1 AND model=$2 AND (SELECT count(*) FROM inv_lab.semantic_items i JOIN inv_lab.semantic_documents d USING(model,hash) WHERE i.version_id=$1 AND i.model=$2 AND d.embedding IS NOT NULL)=(SELECT item_count FROM inv_lab.versions WHERE id=$1) RETURNING ready',[v,m]);return q.rows.length>0;});},
  async fail(v,m,t){const q=await pool.query("UPDATE inv_lab.semantic_versions SET failures=failures+1,last_error='PROVIDER_UNAVAILABLE',retry_after=now()+CASE WHEN failures<2 THEN interval '1 second'*power(2,failures) ELSE interval '60 seconds' END WHERE version_id=$1 AND model=$2 AND token=$3 RETURNING failures",[v,m,t]);const failures=q.rows[0]?.failures||3;return {retry:failures<3,delayMs:1000*2**(failures-1)};},
  async dispatchFailed(v,m){await pool.query("UPDATE inv_lab.semantic_versions SET last_error='DISPATCH_UNAVAILABLE',retry_after=now()+interval '60 seconds' WHERE version_id=$1 AND model=$2 AND NOT ready",[v,m]);},
  async release(v,m,t){await pool.query('UPDATE inv_lab.semantic_versions SET token=NULL,lease_until=NULL WHERE version_id=$1 AND model=$2 AND token=$3',[v,m,t]);},
  async nearest(v,m,vector,n){const q=await pool.query('SELECT i.code,1-(d.embedding OPERATOR(extensions.<=>) $3::extensions.vector) AS similarity FROM inv_lab.semantic_items i JOIN inv_lab.semantic_documents d USING(model,hash) JOIN inv_lab.active a ON a.current_version_id=i.version_id WHERE i.version_id=$1 AND i.model=$2 AND d.embedding IS NOT NULL ORDER BY d.embedding OPERATOR(extensions.<=>) $3::extensions.vector,i.code LIMIT $4',[v,m,JSON.stringify(normalizedVector(vector)),n]);return q.rows;}
 };
}
