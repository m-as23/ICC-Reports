// Build a QA-only Web/Android client from the exact current MainTrack source.
// Does NOT modify canonical assets, publish Web, sign OTA/APK, or change a database.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {checkFutureClientApiSource} from './check-next-release-api-parity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const from=path.join(root,'web/maintrack/public');
const out=path.join(root,'audit-output/staging-client');
const relative='secure-assets/index-inline-1.js';
const OLD='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const NEW='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
const sha256=x=>createHash('sha256').update(x).digest('hex');

export function reviewApiSubstitution(src){
  assert.equal(src.split(OLD).length,2,'REQUIRES_EXACTLY_ONE_LEGACY_API_SOURCE_REFERENCE');
  assert.ok(!src.includes(NEW),'SOURCE_MUST_REMAIN_FROZEN_UNTIL_QA_REVIEWED');
  const dest=src.replace(OLD,NEW);
  assert.equal(dest.replace(NEW,OLD),src,'NON_REVERSIBLE_API_ONLY_CHANGE');
  checkFutureClientApiSource(dest);
  return dest;
}

async function enumerate(dir,prefix=''){
  const names=[];
  for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(e.isSymbolicLink())throw Error('SYMLINK_ASSET_NOT_ALLOWED');
    const rel=path.posix.join(prefix,e.name);
    if(e.isDirectory())names.push(...await enumerate(path.join(dir,e.name),rel));
    else if(e.isFile())names.push(rel);
    else throw Error('UNSUPPORTED_ASSET_TYPE');
  }
  return names;
}

export async function prepareStagingClient({source=from,destination=out}={}){
  assert.notEqual(path.resolve(source),path.resolve(destination),'REFUSE_MUTATE_SOURCE');
  const files=await enumerate(source);
  assert.ok(files.includes(relative),'CLIENT_ENTRY_MISSING');
  assert.ok(files.includes('index.html'),'WEB_HTML_MISSING');
  const js=await fs.readFile(path.join(source,relative),'utf8');
  const transformed=reviewApiSubstitution(js);
  const stage=destination+'.working';
  await fs.rm(stage,{force:true,recursive:true});
  await fs.mkdir(stage,{recursive:true});
  const hashes=[];
  for(const filename of files){
    const src=path.join(source,filename),dst=path.join(stage,filename);
    const raw=await fs.readFile(src);
    const output=filename===relative?Buffer.from(transformed,'utf8'):raw;
    await fs.mkdir(path.dirname(dst),{recursive:true});
    await fs.writeFile(dst,output);
    hashes.push({path:filename,sourceSha256:sha256(raw),stagedSha256:sha256(output),changed:!raw.equals(output)});
  }
  assert.deepEqual(hashes.filter(x=>x.changed).map(x=>x.path),[relative],
    'ONLY_APPROVED_API_STRING_MAY_CHANGE');
  checkFutureClientApiSource(await fs.readFile(path.join(stage,relative),'utf8'));
  await fs.rm(destination,{force:true,recursive:true});
  await fs.rename(stage,destination);
  return {schema:1,mode:'STAGING_ONLY_NO_PUBLISH',
    appId:'com.icc.maintrack',backend:'maintrack-unified-four-qa',apiActions:32,
    source:'web/maintrack/public',output:'audit-output/staging-client',
    files:hashes.length,changed:hashes.filter(x=>x.changed),
    noProductionRelease:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await prepareStagingClient();
  console.log('PASS QA Web/Android client shares one exact reviewed 32-action Staging endpoint; canonical source unchanged.');
  console.log('NO_DEPLOY / NO_APK / NO_OTA / NO_SUPABASE_WRITE',JSON.stringify(report));
}
