// Generate an isolated QA-only Web/Android asset tree, never edit canonical Web/Owner OTA.
// Full original asset tree is copied byte-for-byte except one source-pinned 26->32 action API URL.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareAlignedClient,root,sourcePath,sha256} from './prepare-qa-api-client.mjs';
import {checkFutureClientApiSource} from './check-next-release-api-parity.mjs';

const source=path.join(root,'web/maintrack/public');
export const output=path.join(root,'audit-output/maintrack-qa-bundle');
const entry='secure-assets/index-inline-1.js';
const digest=x=>createHash('sha256').update(x).digest('hex');

async function inventory(dir,segment=''){
 const found=[];
 for(const node of await fs.readdir(path.join(dir,segment),{withFileTypes:true})){
  assert.ok(!node.isSymbolicLink(),'SYMLINK_ASSET_BLOCKED');
  const rel=path.posix.join(segment,node.name);
  if(node.isDirectory())found.push(...await inventory(dir,rel));
  else if(node.isFile())found.push(rel);
  else throw Error('UNSUPPORTED_ASSET_TYPE: '+rel);
 }
 return found.sort();
}

export async function prepareQaBundle({from=source,to=output}={}){
 const absSrc=path.resolve(from),absDst=path.resolve(to);
 assert.notEqual(absSrc,absDst,'REFUSE_OVERWRITE_CANONICAL_SOURCE');
 assert.ok(absDst!==source&&!source.startsWith(absDst+'/')&&!absDst.startsWith(source+'/'),
   'REFUSE_OVERLAPPING_SOURCE_OUTPUT');
 const files=await inventory(absSrc);
 assert.ok(files.includes(entry)&&files.includes('index.html'),'MISSING_WEB_SHELL');
 const sourceJs=await fs.readFile(path.join(absSrc,entry),'utf8');
 const expected=prepareAlignedClient(sourceJs);
 // Write to a temporary sibling; never leave partially accepted output behind.
 const stage=absDst+'.staging';
 await fs.rm(stage,{recursive:true,force:true});
 try{
  await fs.mkdir(stage,{recursive:true});
  const hashes=[];
  for(const rel of files){
    const raw=await fs.readFile(path.join(absSrc,rel));
    const prepared=rel===entry?Buffer.from(expected.content,'utf8'):raw;
    const target=path.join(stage,rel);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,prepared);
    hashes.push({path:rel,sourceSha256:digest(raw),qaSha256:digest(prepared),changed:!raw.equals(prepared)});
  }
  assert.deepEqual(hashes.filter(x=>x.changed).map(x=>x.path),[entry],
    'MORE_THAN_ONE_WEB_ASSET_CHANGED');
  const resultJs=await fs.readFile(path.join(stage,entry),'utf8');
  assert.equal(sha256(resultJs),expected.record.candidateSha256,'QA_CLIENT_SHA256_MISMATCH');
  checkFutureClientApiSource(resultJs);
  const sourceJsAfter=await fs.readFile(path.join(absSrc,entry),'utf8');
  assert.equal(sourceJsAfter,sourceJs,'CANONICAL_SOURCE_CHANGED_DURING_BUILD');
  await fs.rm(absDst,{recursive:true,force:true});
  await fs.rename(stage,absDst);
  return {schema:1,scope:'STAGING_QA_ONLY_NO_DEPLOY',source:'web/maintrack/public',
    package:'com.icc.maintrack',backend:'maintrack-unified-four-qa',actions:32,
    files:files.length,changedAsset:entry,onlyApiChanged:true,
    candidateSha256:expected.record.candidateSha256,assetHashes:hashes,
    nativeApkBuilt:false,otaSigned:false,employeeRelease:false};
 }catch(error){await fs.rm(stage,{recursive:true,force:true});throw error}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await prepareQaBundle();
 await fs.writeFile(output+'.provenance.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS STAGING QA bundle: '+report.files+' assets; only reviewed API URL changed; no deployment.');
}
