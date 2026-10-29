import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
test('permanent migration includes inventory restriction in one transaction without changing Edge payload',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mt-owned-bundle-'));try{
 const out=path.join(temp,'bundle.json');execFileSync(process.execPath,['ops/maintrack/scripts/prepare-permanent-qa.mjs','../evidence/qa-optimization/core-readonly.json',out]);
 const b=JSON.parse(fs.readFileSync(out,'utf8')),prior=JSON.parse(fs.readFileSync('../evidence/qa-execution/deno-runtime/generated.json','utf8'));
 assert.deepEqual(b.files,prior.files,'SQL isolation adds no unrelated Edge changes');
 assert.equal((b.installSql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((b.installSql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.match(b.installSql,/AS RESTRICTIVE FOR ALL TO maintrack_qa_inventory_runtime/);assert.equal(b.deploy,false);
 }finally{fs.rmSync(temp,{recursive:true});}
});
