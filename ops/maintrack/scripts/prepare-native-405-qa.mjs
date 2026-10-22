// MainTrack v0.4.5 native-source QA candidate. No APK, OTA, release or network write.
// Stages immutable canonical Web assets plus the native boot/session/offline bridges.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {prepareAlignedClient,sourcePath,sha256} from './prepare-qa-api-client.mjs';
import {checkFutureClientApiSource} from './check-next-release-api-parity.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const web=path.join(root,'web/maintrack/public');
const app=path.join(root,'android/maintrack-app');
const output=path.join(root,'audit-output/native-405-qa');
const asset='secure-assets/index-inline-1.js';
const tagStartup='<script src="secure-assets/stage13-native-ready.js"></script>';
const tagSession='<script src="secure-assets/stage20-native-session.js"></script>';
const tagLocal='<script src="secure-assets/stage14-local-work.js"></script>';
const safeRel=name=>typeof name==='string'&&name&&!name.startsWith('/')&&!name.includes('\\')&&
  name.split('/').every(x=>x&&x!=='.'&&x!=='..');
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');

export function prepareNativeHtml(source) {
  assert.ok(source.includes('Content-Security-Policy')&&!source.includes('http-equiv="refresh"'),
    'MISSING_OR_UNSAFE_WEB_SECURITY');
  for(const required of ['</head>','</body>','<script src="secure-assets/index-inline-1.js"></script>',
                         '<script src="v6.js"></script>']){
    assert.equal(source.split(required).length,2,'NATIVE_BOOT_HTML_ANCHOR_MISSING_OR_DUPLICATE: '+required);
  }
  for(const injected of [tagStartup,tagSession,tagLocal])
    assert.ok(!source.includes(injected),'NATIVE_BRIDGE_ALREADY_IN_SOURCE');
  const result=source.replace('</head>',tagStartup+'\n'+tagSession+'\n</head>')
                     .replace('</body>',tagLocal+'\n</body>');
  assert.ok(result.indexOf('Content-Security-Policy')<result.indexOf(tagStartup),
    'NATIVE_SCRIPT_LOADED_BEFORE_CSP');
  assert.ok(result.indexOf(tagSession)<result.indexOf('index-inline-1.js'),
    'SECURE_SESSION_MUST_LOAD_BEFORE_MAINTRACK_APP');
  assert.ok(result.indexOf(tagLocal)>result.indexOf('v6.js'),
    'OFFLINE_BRIDGE_MUST_LOAD_AFTER_MAINTRACK_APP');
  assert.equal(result.replace(tagStartup+'\n'+tagSession+'\n','').replace(tagLocal+'\n',''),
    source,'NATIVE_BOOT_UNREVIEWED_HTML_CHANGE');
  return result;
}

export async function inventory(directory,prefix='') {
  const result=[];
  for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const relative=prefix?prefix+'/'+entry.name:entry.name;
    assert.ok(safeRel(relative),'UNSAFE_ASSET_PATH');
    assert.ok(!entry.isSymbolicLink(),'SYMLINK_WEB_ASSET_NOT_ALLOWED');
    if(entry.isDirectory())result.push(...await inventory(path.join(directory,entry.name),relative));
    else if(entry.isFile())result.push(relative);
    else throw Error('UNSUPPORTED_WEB_ASSET_TYPE');
  }
  return result;
}

export async function prepareNativeCandidate({source=web,target=output,buildBundles,pinnedBlob}={}) {
  const names=await inventory(source);
  assert.ok(names.includes(asset)&&names.includes('index.html'),'CANONICAL_WEB_ASSETS_MISSING');
  const original=await fs.readFile(path.join(source,asset),'utf8');
  if(path.resolve(source)===path.resolve(web)){
    assert.equal(path.resolve(source,asset),sourcePath,'UNREVIEWED_WEB_SOURCE');
  }
  const aligned=prepareAlignedClient(original,{pinnedBlob});
  checkFutureClientApiSource(aligned.content);
  const originalHtml=await fs.readFile(path.join(source,'index.html'),'utf8');
  const nativeHtml=prepareNativeHtml(originalHtml);
  const baseTarget=path.resolve(target);
  assert.ok(baseTarget.startsWith(path.resolve(root,'audit-output')+path.sep),
    'CANDIDATE_OUTPUT_MUST_BE_ISOLATED_AUDIT_ONLY');
  const staging=baseTarget+'.working';
  await fs.rm(staging,{recursive:true,force:true});
  await fs.mkdir(path.join(staging,'www'),{recursive:true});
  const snapshot=[];
  try {
    for(const rel of names){
      const raw=await fs.readFile(path.join(source,rel));
      const bytes=Buffer.from(rel===asset?aligned.content:rel==='index.html'?nativeHtml:raw);
      const dest=path.join(staging,'www',rel);
      await fs.mkdir(path.dirname(dest),{recursive:true});
      await fs.writeFile(dest,bytes);
      snapshot.push({path:rel,sourceHash:hash(raw),nativeHash:hash(bytes),
                     altered:!raw.equals(bytes)});
    }
    assert.deepEqual(snapshot.filter(x=>x.altered).map(x=>x.path).sort(),
      ['index.html',asset].sort(),'CHANGED_UNEXPECTED_CANONICAL_ASSETS');
    assert.equal(await fs.readFile(path.join(staging,'www',asset),'utf8'),aligned.content);
    assert.equal(await fs.readFile(path.join(staging,'www','index.html'),'utf8'),nativeHtml);
    assert.equal(typeof buildBundles,'function', 'BUNDLE_BUILDER_REQUIRED');
    const scripts=[
      ['update-system/startup.mjs','secure-assets/stage13-native-ready.js'],
      ['update-system/native-session-entry.mjs','secure-assets/stage20-native-session.js'],
      ['update-system/local-work-startup.mjs','secure-assets/stage14-local-work.js'],
    ];
    const generated=[];
    for(const [entry,rel] of scripts){
      const dest=path.join(staging,'www',rel);
      assert.ok(!names.includes(rel),'GENERATED_SCRIPT_COLLIDES_WITH_SOURCE');
      await buildBundles(path.join(app,entry),dest);
      const bytes=await fs.readFile(dest);
      assert.ok(bytes.length>100&&bytes.length<250000,'UNSAFE_GENERATED_SCRIPT_SIZE: '+rel);
      generated.push({path:rel,sha256:hash(bytes),bytes:bytes.length});
    }
    const ref=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    assert.match(ref,/^[0-9a-f]{40}$/,'INVALID_CANDIDATE_SOURCE_SHA');
    const report={schema:1,mode:'OWNER_QA_SOURCE_NOT_SIGNED_NOT_PUBLISHED',
      sourceCommit:ref,appId:'com.icc.maintrack',proposedVersionName:'0.4.5',
      proposedNativeVersionCode:405,backend:'maintrack-unified-four-qa',
      apiActionContract:32,sourceGitBlob:aligned.record.sourceGitBlob,
      sourceApiSha256:aligned.record.sourceSha256,
      stagedApiSha256:aligned.record.candidateSha256,
      nativeSessionBridge:true,offlineWorkBridge:true,
      assets:snapshot,generated,rollout:false,employeeRelease:false};
    await fs.writeFile(path.join(staging,'provenance.json'),JSON.stringify(report,null,2)+'\n');
    await fs.rm(baseTarget,{recursive:true,force:true});
    await fs.rename(staging,baseTarget);
    return report;
  }catch(e){await fs.rm(staging,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check';
 const original=await fs.readFile(sourcePath,'utf8');
 prepareAlignedClient(original);
 prepareNativeHtml(await fs.readFile(path.join(web,'index.html'),'utf8'));
 await inventory(web);
 if(mode==='--check'){
   console.log('PASS checked immutable Web source, native boot/session/offline injection and safe asset inventory');
   console.log('NO_APK / NO_SIGNING / NO_OTA / NO_DEPLOY');
 }else if(mode==='--prepare'){
   const require=createRequire(path.join(app,'package.json'));
   const esbuild=require('esbuild');
   const report=await prepareNativeCandidate({buildBundles:async(entry,outfile)=>{
     await esbuild.build({entryPoints:[entry],outfile,bundle:true,format:'iife',
       platform:'browser',target:'es2022',minify:true,logLevel:'silent'});
   }});
   console.log('PASS prepared isolated full-source native QA candidate:',JSON.stringify({
     commit:report.sourceCommit,assets:report.assets.length,generated:report.generated.length,
     nextVersionCode:405,signing:false,publishing:false
   }));
 }else throw Error('UNKNOWN_NATIVE_QA_MODE');
}
