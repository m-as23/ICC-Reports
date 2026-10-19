// Prepare and verify a complete, isolated MainTrack Staging Web QA bundle.
// Source is read-only. Exactly one approved API literal may change.
// Output is NEVER a native APK / OTA release and never gets deployed.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareAlignedClient,gitBlob,sha256,PINNED_SOURCE_GIT_BLOB} from './prepare-qa-api-client.mjs';
import {checkFutureClientApiSource} from './check-next-release-api-parity.mjs';

export const root=path.resolve(import.meta.dirname,'../../..');
export const canonicalWeb=path.join(root,'web/maintrack/public');
export const stagedWeb=path.join(root,'audit-output/maintrack-staging-web-qa');
const JS='secure-assets/index-inline-1.js';
const normalize=p=>p.split(path.sep).join('/');
const within=(parent,child)=>child===parent||child.startsWith(parent+path.sep);

async function enumerate(base,sub=''){
 const result=[];
 for(const dirent of (await fs.readdir(path.join(base,sub),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const rel=path.join(sub,dirent.name);
  if(dirent.isSymbolicLink())throw Error('SYMLINK_WEB_ASSET_NOT_ALLOWED: '+normalize(rel));
  if(dirent.isDirectory())result.push(...await enumerate(base,rel));
  else if(dirent.isFile())result.push(normalize(rel));
  else throw Error('UNSUPPORTED_WEB_ASSET_TYPE: '+normalize(rel));
 }
 return result;
}

export async function prepareCompleteStagingWeb({source=canonicalWeb,destination=stagedWeb,
 expectedSourceBlob=PINNED_SOURCE_GIT_BLOB}={}){
 const src=await fs.realpath(source);
 const dest=path.resolve(destination);
 assert.ok(!within(src,dest)&&!within(dest,src),'STAGING_SOURCE_DESTINATION_OVERLAP');
 assert.ok(!within(path.resolve(root,'web'),dest),'REFUSE_WRITE_UNDER_CANONICAL_WEB');
 assert.ok(!within(path.resolve(root,'android'),dest),'REFUSE_WRITE_UNDER_ANDROID');
 // Destination is a new scratch directory; never delete an existing path.
 await assert.rejects(fs.lstat(dest),{code:'ENOENT'},'STAGING_OUTPUT_ALREADY_EXISTS');
 const files=await enumerate(src);
 assert.ok(files.includes('index.html')&&files.includes(JS),'WEB_ESSENTIALS_MISSING');
 assert.ok(files.length<=1000&&files.length>2,'WEB_ASSET_COUNT_OUT_OF_BOUNDS');
 const sourceJS=await fs.readFile(path.join(src,JS),'utf8');
 const candidate=prepareAlignedClient(sourceJS,{pinnedBlob:expectedSourceBlob});
 checkFutureClientApiSource(candidate.content);
 const hashes=[];
 await fs.mkdir(dest,{recursive:true});
 for(const name of files){
  assert.ok(!name.startsWith('/')&&!name.includes('..')&&!name.includes('\\'),'UNSAFE_WEB_PATH');
  const raw=await fs.readFile(path.join(src,name));
  const bytes=name===JS?Buffer.from(candidate.content,'utf8'):raw;
  const target=path.join(dest,name);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,bytes,{flag:'wx'});
  const saved=await fs.readFile(target);
  assert.ok(saved.equals(bytes),'STAGING_COPY_BYTES_CHANGED');
  hashes.push({path:name,sourceSha256:sha256(raw),candidateSha256:sha256(saved),bytes:saved.length,changed:!raw.equals(saved)});
 }
 assert.deepEqual(hashes.filter(x=>x.changed).map(x=>x.path),[JS],'ONLY_APPROVED_API_JS_CAN_CHANGE');
 assert.equal(gitBlob(await fs.readFile(path.join(src,JS))),candidate.record.sourceGitBlob,'CANONICAL_WEB_MUTATED_DURING_QA');
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.match(commit,/^[a-f0-9]{40}$/,'INVALID_REVIEW_COMMIT');
 const manifest={schema:1,mode:'STAGING_WEB_QA_ONLY_NO_PUBLISH',commit,
   source:'web/maintrack/public',appId:'com.icc.maintrack',
   backend:'maintrack-unified-four-qa',requiredActions:32,
   sourceGitBlob:candidate.record.sourceGitBlob,changedFiles:[JS],
   files:hashes,deploy:false,apkBuild:false,otaSign:false,employeeRollout:false};
 // This manifest is an audit file, NOT part of the Web assets being reviewed.
 await fs.writeFile(dest+'-provenance.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}

export async function verifyCompleteStagingWeb({source=canonicalWeb,destination=stagedWeb,manifestPath=stagedWeb+'-provenance.json',expectedSourceBlob=PINNED_SOURCE_GIT_BLOB}={}){
 const original=await fs.readFile(path.join(source,JS),'utf8');
 const candidate=prepareAlignedClient(original,{pinnedBlob:expectedSourceBlob});
 const meta=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 assert.equal(meta.mode,'STAGING_WEB_QA_ONLY_NO_PUBLISH');
 assert.equal(meta.backend,'maintrack-unified-four-qa');
 assert.equal(meta.requiredActions,32);
 assert.deepEqual(meta.changedFiles,[JS]);
 assert.equal(meta.sourceGitBlob,expectedSourceBlob);
 for(const k of ['deploy','apkBuild','otaSign','employeeRollout'])assert.equal(meta[k],false);
 const sourceFiles=await enumerate(source);
 const stagedFiles=await enumerate(destination);
 assert.deepEqual(stagedFiles,sourceFiles,'STAGING_ASSET_LIST_CHANGED');
 assert.deepEqual(meta.files.map(x=>x.path),sourceFiles,'STAGING_PROVENANCE_FILE_LIST_CHANGED');
 for(const m of meta.files){
  const raw=await fs.readFile(path.join(source,m.path));
  const expected=m.path===JS?Buffer.from(candidate.content,'utf8'):raw;
  const staged=await fs.readFile(path.join(destination,m.path));
  assert.ok(staged.equals(expected),'QA_ASSET_BYTES_TAMPERED: '+m.path);
  assert.equal(sha256(raw),m.sourceSha256,'SOURCE_SHA_CHANGED: '+m.path);
  assert.equal(sha256(staged),m.candidateSha256,'CANDIDATE_SHA_CHANGED: '+m.path);
  assert.equal(staged.length,m.bytes,'CANDIDATE_LENGTH_CHANGED: '+m.path);
  assert.equal(!raw.equals(staged),m.changed,'UNEXPECTED_CHANGED_FLAG');
 }
 checkFutureClientApiSource(await fs.readFile(path.join(destination,JS),'utf8'));
 return {files:stagedFiles.length,changed:1,apiActions:32,mode:meta.mode};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check';
 if(mode==='--prepare'){const m=await prepareCompleteStagingWeb();console.log('PASS complete Staging Web QA candidate prepared:',m.files.length,'files; one reviewed API-only replacement.');}
 else if(mode==='--verify'){const r=await verifyCompleteStagingWeb();console.log('PASS complete source-safe Web QA candidate:',JSON.stringify(r));}
 else throw Error('UNKNOWN_STAGING_BUNDLE_MODE');
 console.log('NO_APK / NO_OTA / NO_VERCEL / NO_SUPABASE_WRITE / NO_EMPLOYEE_RELEASE');
}
