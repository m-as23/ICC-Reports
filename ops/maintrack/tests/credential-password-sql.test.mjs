import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
const {PGlite}=createRequire(process.env.LEDGER_PG_PACKAGE||new URL('../../../audit-output/test-runtime/package.json',import.meta.url).pathname)('@electric-sql/pglite');
test('actual password-change SQL accepts the current password and rejects an incorrect password',async()=>{
 const source=await fs.readFile(new URL('../../../supabase/functions/maintrack-final-047/index.ts',import.meta.url),'utf8');
 const sql=source.match(/SELECT \(\$[12]=extensions\.crypt\(\$1,\$2\)\) AS valid/)?.[0];assert.ok(sql);
 const db=new PGlite();try{
  // Deterministic crypto boundary substitute; this test checks actual SQL comparison semantics.
  // The same expression was independently checked with real Supabase pgcrypto and synthetic values.
  await db.exec("CREATE SCHEMA extensions; CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS $$ SELECT 'hash:' || $1 $$;");
  assert.equal((await db.query(sql,['Current1','hash:Current1'])).rows[0].valid,true);
  assert.equal((await db.query(sql,['Wrong123','hash:Current1'])).rows[0].valid,false);
 }finally{await db.close();}
});
