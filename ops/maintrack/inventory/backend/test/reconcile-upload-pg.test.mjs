import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import pg from 'pg';import {createHash} from 'node:crypto';import {PostgresInventoryStore} from '../src/postgres-store.mjs';import {reconcileUpload} from '../src/reconcile-upload.mjs';
test('real PostgreSQL reconciliation fences late staging without deleting files or versions',{skip:!process.env.LOGIN_PG_URL},async()=>{
 const url=new URL(process.env.LOGIN_PG_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55438');assert.equal(url.pathname,'/maintrack_auth_local');
 const pool=new pg.Pool({connectionString:url.href,max:3});let created=false,pending,release;const wait=new Promise(r=>release=r);const bytes=Buffer.from('synthetic owned bytes');let key;const hash=createHash('sha256').update(bytes).digest('hex');
 const files={putObject:async x=>{key=x.key;await wait;},getObject:async()=>bytes,deleteObject:()=>{throw Error('DELETE_FORBIDDEN');}};const store=new PostgresInventoryStore({pool,privateFiles:files});
 try{
  assert.equal((await pool.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'MAINTRACK_LOGIN_LOCAL_EPHEMERAL_V1');
  assert.equal((await pool.query("SELECT to_regclass('inv_lab.upload_intents') r")).rows[0].r,null);
  await pool.query(fs.readFileSync(new URL('../upload-intents.review.sql',import.meta.url),'utf8'));created=true;
  const count=(await pool.query('SELECT count(*)::int n FROM inv_lab.versions')).rows[0].n;
  pending=store.stage({items:[],filename:'synthetic.xlsx',fileSha256:hash,buffer:bytes,actor:'LOCAL-SYNTHETIC'}).then(()=>({ok:true}),error=>({error}));
  const deadline=Date.now()+2000;while(!key&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(key);
  await assert.rejects(()=>store.quarantineUpload({storageKey:key,fileSha256:hash,actor:'WRONG-ACTOR'}),/SCOPE_MISMATCH/);
  const r=await reconcileUpload({store,privateFiles:files,scope:{storageKey:key,fileSha256:hash,actor:'LOCAL-SYNTHETIC'}});assert.equal(r.status,'QUARANTINED_OBJECT_RETAINED');assert.equal(r.cleanupVerified,false);
  release();const outcome=await pending;assert.match(outcome.error?.cause?.message||'',/UPLOAD_FENCED/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM inv_lab.versions')).rows[0].n,count);
  await assert.rejects(()=>store.stage({items:[],filename:'second.xlsx',fileSha256:hash,buffer:bytes,actor:'LOCAL-SYNTHETIC'}),e=>e.code==='23505');
  assert.equal((await pool.query('SELECT state FROM inv_lab.upload_intents')).rows[0].state,'QUARANTINED');
 }finally{release();if(pending)await pending;if(created)await pool.query('DROP TABLE inv_lab.upload_intents');await pool.end();}
});
