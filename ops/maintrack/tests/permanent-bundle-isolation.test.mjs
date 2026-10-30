import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
test('permanent migration preserves unrelated Edge payload and embeds the current reviewed login budget',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mt-owned-bundle-'));try{
 const out=path.join(temp,'bundle.json');execFileSync(process.execPath,['ops/maintrack/scripts/prepare-permanent-qa.mjs','../evidence/qa-optimization/core-readonly.json',out]);
 const b=JSON.parse(fs.readFileSync(out,'utf8')),prior=JSON.parse(fs.readFileSync('../evidence/qa-execution/deno-runtime/generated.json','utf8'));
 const currentBudget=fs.readFileSync('supabase/functions/maintrack-final-047/login-rate-limit.mjs','utf8');
 assert.equal(prior.files.filter(f=>f.name==='login-rate-limit.mjs').length,1);
 const expected=prior.files.map(f=>f.name==='login-rate-limit.mjs'?{...f,content:currentBudget}:f);
 assert.deepEqual(b.files,expected,'only the canonical budget may differ from the retained bundle; all other Edge bytes must match');
 assert.equal((b.installSql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((b.installSql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.match(b.installSql,/AS RESTRICTIVE FOR ALL TO maintrack_qa_inventory_runtime/);assert.equal(b.deploy,false);
 }finally{fs.rmSync(temp,{recursive:true});}
});
