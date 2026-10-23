// Disposable CI database only. No network provider, accounts or real inventory.
import test from 'node:test';import assert from 'node:assert/strict';
import {createPostgresSemanticIndex} from '../src/postgres-semantic-store.mjs';
import {documentForItem} from '../src/semantic-search.mjs';
test('private pgvector index: leases, partial readiness, current-only nearest, reuse, and browser denial',{skip:process.env.SEMANTIC_DB_TEST!=='1'},async()=>{
 const {default:pg}=await import('pg');const pool=new pg.Pool({max:2});
 const db=await pool.connect();await db.query('BEGIN');
 // Bind adapter transactions to this enclosing rollback-only connection.
 const adapterPool={query:(...a)=>db.query(...a),connect:async()=>({query:(s,p)=>s==='BEGIN'||s==='COMMIT'||s==='ROLLBACK'?Promise.resolve({rows:[]}):db.query(s,p),release(){}})};
 try{
  const make=async(parent=null)=>{const r=await db.query("INSERT INTO inv_lab.versions(filename,file_sha256,parent_version_id,created_by) VALUES('synthetic.xlsx',repeat('f',64),$1,'QA_OWNER') RETURNING id::text",[parent]);const v=r.rows[0].id;await db.query("INSERT INTO inv_lab.items(version_id,code,description,quantity,location) VALUES($1,'A','Thermocouple TYPE K',2,'R1'),($1,'B','Limit switch',3,'R2')",[v]);await db.query('SELECT inv_lab.seal_version($1,$2)',[v,'QA_OWNER']);await db.query('SELECT inv_lab.publish_version($1,$2,$3)',[v,parent,'QA_OWNER']);return v;};
  const v=await make(),idx=createPostgresSemanticIndex({pool:adapterPool}),model='test-model';
  const docs=[documentForItem({code:'A',description:'Thermocouple TYPE K'}),documentForItem({code:'B',description:'Limit switch'})];
  const token=await idx.claim(v,model);assert.ok(token);assert.equal(await idx.claim(v,model),null);
  await idx.prepare(v,model,token,docs);assert.equal((await idx.pending(v,model,docs,64)).length,2);
  const vector=(a,b)=>[a,b,...Array(254).fill(0)];
  await idx.save(v,model,token,[{...docs[0],vector:vector(1,0)}]);assert.equal(await idx.finish(v,model,token),false);
  await idx.save(v,model,token,[{...docs[1],vector:vector(0,1)}]);assert.equal(await idx.finish(v,model,token),true);
  assert.deepEqual(await idx.status(v,model),{ready:true,error:null,total:2,indexed:2});
  assert.equal((await idx.nearest(v,model,vector(1,0),10))[0].code,'A');
  await idx.release(v,model,token);
  const v2=await make(v),t2=await idx.claim(v2,model);await idx.prepare(v2,model,t2,docs);
  assert.equal((await idx.pending(v2,model,docs,64)).length,0,'unchanged descriptions reuse document vectors');assert.equal(await idx.finish(v2,model,t2),true);
  assert.equal((await idx.nearest(v,model,vector(1,0),10)).length,0,'archived version cannot supply results');
  await db.query('SAVEPOINT browser_denial');await db.query('CREATE ROLE semantic_untrusted NOLOGIN');await db.query('SET LOCAL ROLE semantic_untrusted');
  await assert.rejects(()=>db.query('SELECT * FROM inv_lab.semantic_documents'),/permission denied/);await db.query('ROLLBACK TO SAVEPOINT browser_denial');
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
});
