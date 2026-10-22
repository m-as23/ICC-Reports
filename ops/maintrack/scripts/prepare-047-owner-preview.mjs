// Owner-requested 047 preview packaging. Never mutates historic source locks.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {prepareCompleteStagingWeb} from './prepare-complete-staging-web.mjs';
import {prepareNativeCandidate,prepareNativeHtml,inventory} from './prepare-native-405-qa.mjs';
import {sha256,prepareAlignedClient} from './prepare-qa-api-client.mjs';
import {verifyNativeSessionAssets} from './check-next-native-session-assets.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const policyPath=path.join(root,'ops/maintrack/security/owner-047-preview-source.json');
const defaults={source:path.join(root,'web/maintrack/public'),target:path.join(root,'audit-output/owner-047')};
const hashFile=async file=>sha256(await fs.readFile(file));
async function verifySource(source,policy){
 const files=await inventory(source);
 assert.deepEqual(files,policy.assets.map(x=>x.path),'SOURCE_FILE_LIST_MISMATCH');
 for(const item of policy.assets)assert.equal(await hashFile(path.join(source,item.path)),item.sha256,'SOURCE_HASH_MISMATCH: '+item.path);
}
export async function prepare047({source=defaults.source,target=defaults.target}={}){
 const policy=JSON.parse(await fs.readFile(policyPath,'utf8'));
 assert.equal(policy.appId,'com.icc.maintrack');
 assert.equal(policy.versionCode,407);
 assert.equal(policy.versionName,'0.4.7');
 assert.equal(policy.employeeRollout,false);
 assert.ok(path.resolve(target).startsWith(path.join(root,'audit-output')+path.sep),'OUTPUT_MUST_BE_ISOLATED');
 assert.equal(execFileSync('git',['merge-base',policy.reviewedSourceCommit,'HEAD'],{cwd:root,encoding:'utf8'}).trim(),policy.reviewedSourceCommit,'UNREVIEWED_SOURCE_ANCESTRY');
 await verifySource(source,policy);
 await assert.rejects(fs.stat(target),{code:'ENOENT'},'OUTPUT_ALREADY_EXISTS');
 const require=createRequire(path.join(root,'android/maintrack-app/package.json'));
 const esbuild=require('esbuild');
 const web=path.join(target,'web'), native=path.join(target,'native');
 await prepareCompleteStagingWeb({source,destination:web,expectedSourceBlob:policy.canonicalJsGitBlob});
 await prepareNativeCandidate({source,target:native,pinnedBlob:policy.canonicalJsGitBlob,
  buildBundles:async(entry,outfile)=>esbuild.build({entryPoints:[entry],outfile,bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,logLevel:'silent'})});
 // Identical version presentation on both platforms; original source stays intact.
 for(const folder of [web,path.join(native,'www')]){
  const htmlFile=path.join(folder,'index.html');
  const html=await fs.readFile(htmlFile,'utf8');
  assert.equal((html.match(/<title>[\s\S]*?<\/title>/g)||[]).length,1);
  await fs.writeFile(htmlFile,html.replace(/<title>[\s\S]*?<\/title>/,'<title>MainTrack 0.4.7 — Owner Preview</title>'));
  const manifestFile=path.join(folder,'manifest.webmanifest');
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  manifest.name='MainTrack 0.4.7 — Owner Preview';
  await fs.writeFile(manifestFile,JSON.stringify(manifest)+'\n');
 }
 const sharedAssets=[];
 for(const rel of await inventory(web))sharedAssets.push({path:rel,sha256:await hashFile(path.join(web,rel))});
 const generated=[];
 for(const item of (JSON.parse(await fs.readFile(path.join(native,'provenance.json'),'utf8'))).generated)generated.push(item);
 const report={schema:1,channel:'OWNER_PREVIEW_047',appId:policy.appId,versionName:policy.versionName,versionCode:policy.versionCode,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),reviewedSourceCommit:policy.reviewedSourceCommit,
  backend:'maintrack-unified-four-qa',inventoryLive:false,mailWorker047Deployed:false,employeeRollout:false,otaPublished:false,
  sharedAssets,generated,certificateSha256:policy.certificateSha256,deviceInstallTest:'NOT_RUN'};
 await fs.writeFile(path.join(target,'provenance.json'),JSON.stringify(report,null,2)+'\n');
 await verifySource(source,policy);
 return verify047Parity(target);
}
export async function verify047Parity(target=defaults.target){
 const policy=JSON.parse(await fs.readFile(policyPath,'utf8'));
 await verifySource(defaults.source,policy);
 const report=JSON.parse(await fs.readFile(path.join(target,'provenance.json'),'utf8'));
 assert.equal(report.sourceCommit,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),'WRONG_SOURCE_COMMIT');
 assert.equal(report.reviewedSourceCommit,policy.reviewedSourceCommit,'WRONG_REVIEWED_SOURCE');
 assert.equal(report.certificateSha256,policy.certificateSha256,'WRONG_OWNER_CERTIFICATE');
 assert.equal(report.channel,'OWNER_PREVIEW_047');
 assert.equal(report.appId,'com.icc.maintrack');
 assert.equal(report.versionCode,407);
 assert.equal(report.versionName,'0.4.7');
 assert.equal(report.employeeRollout,false);
 assert.equal(report.inventoryLive,false);
 const web=path.join(target,'web'),native=path.join(target,'native/www');
 assert.deepEqual(report.sharedAssets.map(x=>x.path),policy.assets.map(x=>x.path),'UNREVIEWED_SHARED_ASSET_LIST');
 assert.deepEqual(await inventory(web),report.sharedAssets.map(x=>x.path),'WEB_ASSET_LIST_MISMATCH');
 assert.deepEqual((await inventory(native)).sort(),[...report.sharedAssets.map(x=>x.path),...report.generated.map(x=>x.path)].sort(),'NATIVE_ASSET_LIST_MISMATCH');
 for(const item of report.sharedAssets){
  let expected=await fs.readFile(path.join(defaults.source,item.path));
  if(item.path==='secure-assets/index-inline-1.js')expected=Buffer.from(prepareAlignedClient(expected.toString('utf8'),{pinnedBlob:policy.canonicalJsGitBlob}).content);
  if(item.path==='index.html')expected=Buffer.from(expected.toString('utf8').replace(/<title>[\s\S]*?<\/title>/,'<title>MainTrack 0.4.7 — Owner Preview</title>'));
  if(item.path==='manifest.webmanifest'){
   const manifest=JSON.parse(expected.toString('utf8'));manifest.name='MainTrack 0.4.7 — Owner Preview';expected=Buffer.from(JSON.stringify(manifest)+'\n');
  }
  assert.equal(item.sha256,sha256(expected),'UNREVIEWED_SHARED_ASSET_HASH: '+item.path);
  assert.equal(await hashFile(path.join(web,item.path)),item.sha256,'WEB_ASSET_MISMATCH: '+item.path);
  if(item.path==='index.html')assert.equal(await fs.readFile(path.join(native,item.path),'utf8'),prepareNativeHtml(await fs.readFile(path.join(web,item.path),'utf8')),'NATIVE_HTML_MISMATCH');
  else assert.equal(await hashFile(path.join(native,item.path)),item.sha256,'NATIVE_ASSET_MISMATCH: '+item.path);
 }
 const entries=[['update-system/startup.mjs','secure-assets/stage13-native-ready.js'],['update-system/native-session-entry.mjs','secure-assets/stage20-native-session.js'],['update-system/local-work-startup.mjs','secure-assets/stage14-local-work.js']];
 assert.deepEqual(report.generated.map(x=>x.path),entries.map(x=>x[1]),'UNREVIEWED_NATIVE_BRIDGE_LIST');
 const require=createRequire(path.join(root,'android/maintrack-app/package.json'));
 const esbuild=require('esbuild');
 for(const [entry,rel] of entries){
  const expected=await esbuild.build({entryPoints:[path.join(root,'android/maintrack-app',entry)],outfile:'out.js',write:false,bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,logLevel:'silent'});
  assert.equal(await hashFile(path.join(native,rel)),sha256(expected.outputFiles[0].contents),'NATIVE_BRIDGE_ASSET_MISMATCH: '+rel);
 }
 verifyNativeSessionAssets(native);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=process.argv[2]==='--verify'?await verify047Parity():await prepare047();
 console.log('PASS 047 shared Web/native app source and secure-session bridges',JSON.stringify({version:report.versionName,code:report.versionCode,assets:report.sharedAssets.length,source:report.sourceCommit}));
}
