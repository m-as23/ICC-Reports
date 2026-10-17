import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {carryWebHistory} from '../update-system/web-history.mjs';

const OLD='a'.repeat(40), OTHER='b'.repeat(40), NEXT='c'.repeat(40);
async function fixture(run) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mt-web-history-'));
  const previous=path.join(root,'previous','releases');
  const next=path.join(root,'candidate');
  await fs.mkdir(path.join(previous,OLD),{recursive:true});
  await fs.writeFile(path.join(previous,OLD,'index.html'),'<html>Previous MainTrack</html>');
  try { await run({root,previous:path.dirname(previous),next}); }
  finally { await fs.rm(root,{recursive:true,force:true}); }
}
test('immutable old Web entry is carried forward without replacing the new version',async()=>{
  await fixture(async({previous,next})=>{
    const kept=await carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:NEXT,requireHistory:true});
    assert.deepEqual(kept,[OLD]);
    assert.match(await fs.readFile(path.join(next,'releases',OLD,'index.html'),'utf8'),/Previous MainTrack/);
    await fs.mkdir(path.join(next,'releases',NEXT));
    await fs.writeFile(path.join(next,'releases',NEXT,'index.html'),'New MainTrack');
    assert.equal(await fs.readFile(path.join(next,'releases',OLD,'index.html'),'utf8'),'<html>Previous MainTrack</html>');
  });
});
test('upgrading an existing Web host without previous versions is blocked',async()=>{
  await fixture(async({next})=>assert.rejects(carryWebHistory({currentStatic:next,currentCommit:NEXT,requireHistory:true}),/PREVIOUS_WEB_RELEASES_REQUIRED/));
});
test('untrusted/missing/overlapping Web history is rejected before packaging',async()=>{
  await fixture(async({previous,next})=>{
    await fs.mkdir(path.join(previous,'releases',OTHER));
    await assert.rejects(carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:NEXT}),/MISSING_HISTORICAL_WEB_ENTRY/);
    await fs.writeFile(path.join(previous,'releases',OTHER,'index.html'),'old B');
    assert.deepEqual((await carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:NEXT})),[OLD,OTHER]);
    await assert.rejects(carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:NEXT}));
    await assert.rejects(carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:OLD}),/UNTRUSTED_WEB_RELEASE_DIRECTORY/);
  });
});
test('symlinks in historical Web output cannot be copied into hosted assets',async()=>{
  await fixture(async({previous,next,root})=>{
    await fs.symlink(root,path.join(previous,'releases',OLD,'escape'));
    await assert.rejects(carryWebHistory({previousStatic:previous,currentStatic:next,currentCommit:NEXT}),/UNSAFE_PREVIOUS_RELEASE_TREE/);
  });
});
