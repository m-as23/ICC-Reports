// Carry forward immutable Web release directories when building an update.
// Publishing only the newest directory would 404 users who are still running an older URL.
import fs from 'node:fs/promises';
import path from 'node:path';
const COMMIT = /^[a-f0-9]{40}$/;
async function assertPlainTree(root) {
  for (const entry of await fs.readdir(root, {withFileTypes:true})) {
    const child = path.join(root,entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw Error('UNSAFE_PREVIOUS_RELEASE_TREE');
    if (entry.isDirectory()) await assertPlainTree(child);
  }
}
export async function carryWebHistory({previousStatic, currentStatic, currentCommit, requireHistory = false}) {
  if (!COMMIT.test(currentCommit)) throw Error('INVALID_CURRENT_WEB_COMMIT');
  if (!previousStatic) {
    if (requireHistory) throw Error('PREVIOUS_WEB_RELEASES_REQUIRED');
    return [];
  }
  const source = path.resolve(previousStatic,'releases');
  const target = path.resolve(currentStatic,'releases');
  if (source === target || target.startsWith(source + path.sep) || source.startsWith(target + path.sep))
    throw Error('OVERLAPPING_RELEASE_DIRECTORIES');
  const entries = await fs.readdir(source,{withFileTypes:true});
  if (!entries.length || entries.length > 30) throw Error('INVALID_RELEASE_HISTORY_COUNT');
  for (const entry of entries) {
    if (!entry.isDirectory() || !COMMIT.test(entry.name) || entry.name === currentCommit)
      throw Error('UNTRUSTED_WEB_RELEASE_DIRECTORY');
    const dir = path.join(source,entry.name);
    await assertPlainTree(dir);
    const index = await fs.stat(path.join(dir,'index.html')).catch(() => null);
    if (!index?.isFile()) throw Error('MISSING_HISTORICAL_WEB_ENTRY');
  }
  await fs.mkdir(target,{recursive:true});
  for (const entry of entries) {
    await fs.cp(path.join(source,entry.name),path.join(target,entry.name),
      {recursive:true,force:false,errorOnExist:true,dereference:false});
  }
  return entries.map(x=>x.name).sort();
}
