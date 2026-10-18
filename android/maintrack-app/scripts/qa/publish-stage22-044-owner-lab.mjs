// One-owner LAB rollout only. GitHub protected maintrack-android-release environment.
// Verifies trusted 0.4.3 manifest, approved 0.4.4 build and prior owner-key attestation.
// Never writes Production backend, Vercel or user data. No secrets in logs.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {canonicalJson,compareVersions} from '../../update-system/policy.mjs';

const repo='m-as23/ICC-Reports';
const labBranch='android/stage14-ota-native-lab';
const source='865229c4706e946377fba811d2f51dad1a815138';
const reviewSha='aabfa193d2d92db3dcc1881b5245a546ad0a236345b526e97b8c8defcfc7a39e';
const expectedOldSha='acec8f1f4e733e18ad20d038204667817f83644be706834f0481909c077572f6';
const contract={reportQueue:1,writesReportQueue:1,migration:'none'};
const fail=(ok,msg)=>{if(!ok)throw Error(msg)};
const same=(actual,expected,msg)=>fail(JSON.stringify(actual)===JSON.stringify(expected),msg);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
fail(process.env.GITHUB_REPOSITORY===repo,'WRONG_GITHUB_REPO');
fail(process.env.GITHUB_REF==='refs/heads/release/maintrack-stage22-044-integration','WRONG_RELEASE_BRANCH');
fail(!!process.env.GH_TOKEN,'MISSING_REPO_WRITE_TOKEN');
fail(!!process.env.MT_OTA_PRIVATE_KEY_PEM,'OWNER_SIGNING_KEY_UNAVAILABLE');

const cfg=JSON.parse(fs.readFileSync('release/owner-public.json','utf8'));
same(cfg.channel,'lab','WRONG_SIGNING_CHANNEL');
same(cfg.manifestUrl,'https://raw.githubusercontent.com/'+repo+'/'+labBranch+'/updates/android/release.json','MANIFEST_URL_CHANGED');
const pub=crypto.createPublicKey({key:Buffer.concat([
 Buffer.from('302a300506032b6570032100','hex'),
 Buffer.from(cfg.publicKeyBase64,'base64url')
]),format:'der',type:'spki'});
const privateKey=crypto.createPrivateKey({
 key:process.env.MT_OTA_PRIVATE_KEY_PEM,
 passphrase:process.env.MT_OTA_PRIVATE_KEY_PASSWORD||undefined
});
same(crypto.createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),
 cfg.publicKeyBase64,'OWNER_PUBLIC_KEY_MISMATCH');
function verify(envelope){
 return crypto.verify(null,Buffer.from(canonicalJson(envelope.payload)),pub,Buffer.from(envelope.signature,'base64url'));
}

const proofDirs=['owner-attestation/stage22-044-signonly-attestation.json',
 'owner-attestation/release-output/stage22-044-signonly-attestation.json'];
const proofFile=proofDirs.find(p=>fs.existsSync(p));
fail(!!proofFile,'OWNER_ATTESTATION_MISSING');
const att=JSON.parse(fs.readFileSync(proofFile,'utf8'));
fail(verify(att),'OWNER_ATTESTATION_SIGNATURE_INVALID');
same(att.payload.kind,'stage22-reviewed-hashes-only','WRONG_PROOF_KIND');
same(att.payload.status,'SIGNED_NOT_PUBLISHED','WRONG_PROOF_STATUS');
same(att.payload.sourceCommit,source,'WRONG_REVIEW_SOURCE');
same(att.payload.reviewRunId,39127423740,'UNAPPROVED_REVIEW_RUN');
same(att.payload.priorVersion,'0.4.3','UNEXPECTED_PREVIOUS_VERSION');
same(att.payload.newVersion,'0.4.4','UNEXPECTED_NEW_VERSION');
same(att.payload.androidUnsigned.sha256,reviewSha,'UNAPPROVED_REVIEW_ARCHIVE');
same(att.payload.localData,contract,'WRONG_SIGNED_QUEUE_CONTRACT');
same(att.payload.approvedForDeployment,false,'ATTESTATION_CHANGED');
same(att.payload.otaManifestChanged,false,'ATTESTATION_CHANGED_MANIFEST');

const build=JSON.parse(fs.readFileSync('stage22-044-lab/lab-build.json','utf8'));
same(build.status,'BUILT_NOT_SIGNED_NOT_PUBLISHED','WRONG_BUILD_MODE');
same(build.channel,'lab','WRONG_BUILD_CHANNEL');
same(build.version,'0.4.4','WRONG_VERSION');
same(build.appId,'com.icc.maintrack','WRONG_APP');
same(build.sourceCommit,source,'WRONG_SOURCE');
same(build.sourceReviewRun,39127423740,'WRONG_REVIEW_RUN');
same(build.backend,'maintrack-unified-four-qa','NOT_QA_BACKEND');
same(build.changedArchiveMembers,['secure-assets/index-inline-1.js'],'WRONG_ZIP_DIFF');
same(build.reviewedZip.sha256,reviewSha,'CHANGED_REVIEW_ARTIFACT');
same(build.localData,contract,'WRONG_QUEUE_CONTRACT');
const archive=fs.readFileSync('stage22-044-lab/maintrack-0.4.4.zip');
same(build.archive,{sha256:hash(archive),bytes:archive.length},'ARCHIVE_BYTES_CHANGED');
fail(archive.length>100&&archive.length<=15_000_000,'ARCHIVE_SIZE_INVALID');
fail(compareVersions('0.4.4','0.4.3')>0,'NOT_NEWER');

async function api(path,method='GET',data){
 const response=await fetch('https://api.github.com/repos/'+repo+'/'+path,{
   method,
   headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json',
     'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
   body:data?JSON.stringify(data):undefined
 });
 if(method==='GET'&&response.status===404)return null;
 if(!response.ok)throw Error('GITHUB_'+method+'_FAILED_'+response.status);
 return response.json();
}
const manifestPath='updates/android/release.json';
const current=await api('contents/'+manifestPath+'?ref='+encodeURIComponent(labBranch));
fail(!!current,'SIGNED_043_MANIFEST_MISSING');
const old=JSON.parse(Buffer.from(current.content,'base64').toString('utf8'));
fail(verify(old),'PREVIOUS_SIGNED_MANIFEST_INVALID');
same(old.payload.schema,1,'OLD_SCHEMA_CHANGED');
same(old.payload.bundleVersion,'0.4.3','CONCURRENT_CHANNEL_UPDATE');
same(old.payload.sha256,expectedOldSha,'UNEXPECTED_EXISTING_043_BUNDLE');
same(old.payload.appId,'com.icc.maintrack','OLD_APP_CHANGED');
same(old.payload.channel,'lab','OLD_CHANNEL_CHANGED');
same(old.payload.localData,contract,'OLD_DATA_CONTRACT_CHANGED');
const bundlePath='updates/android/maintrack-0.4.4.zip';
fail(!(await api('contents/'+bundlePath+'?ref='+encodeURIComponent(labBranch))),'IMMUTABLE_044_ALREADY_EXISTS');
const saved=await api('contents/'+bundlePath,'PUT',{
  message:'release(owner-lab): add immutable signed-channel OTA 0.4.4 QA payload [skip ci]',
  branch:labBranch, content:archive.toString('base64')
});
const commit=saved.commit?.sha;
fail(/^[a-f0-9]{40}$/.test(commit),'IMMUTABLE_COMMIT_MISSING');
const bundleUrl='https://raw.githubusercontent.com/'+repo+'/'+commit+'/'+bundlePath;
let reachable=false;
for(let i=0;i<10;i++){
  const r=await fetch(bundleUrl,{cache:'no-store'});
  if(r.ok){
    const actual=Buffer.from(await r.arrayBuffer());
    if(actual.length===archive.length&&hash(actual)===hash(archive)){reachable=true;break;}
  }
  await new Promise(resolve=>setTimeout(resolve,1500));
}
fail(reachable,'SIGNED_MANIFEST_NOT_CHANGED_REMOTE_BUNDLE_UNAVAILABLE');
const now=Date.now();
const payload={
  schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',
  issuedAt:now-1000,expiresAt:now+6*86400000,
  nativeMinimum:'0.4.1',nativeMaximum:'0.4.99',
  bundleVersion:'0.4.4',bundleUrl,
  sha256:hash(archive),bytes:archive.length,localData:contract,sourceCommit:source
};
const signature=crypto.sign(null,Buffer.from(canonicalJson(payload)),privateKey).toString('base64url');
const signed={payload,signature};
fail(verify(signed),'NEW_OWNER_SIGNATURE_INVALID');
// Optimistic concurrency. If someone changed 0.4.3 meanwhile, do not replace their release.
await api('contents/'+manifestPath,'PUT',{
  message:'release(owner-lab): activate signed OTA 0.4.4 for installed owner device [skip ci]',
  branch:labBranch,sha:current.sha,
  content:Buffer.from(JSON.stringify(signed,null,2)+'\n').toString('base64')
});
fs.mkdirSync('release-output',{recursive:true});
fs.writeFileSync('release-output/stage22-044-owner-lab.json',JSON.stringify({
  status:'SIGNED_LAB_OTA_PUBLISHED',archiveSha256:payload.sha256,archiveBytes:payload.bytes,
  appId:payload.appId,channel:payload.channel,version:payload.bundleVersion,
  sourceCommit:source,immutableBundleUrl:bundleUrl,expiresAt:payload.expiresAt,
  manifestUrl:cfg.manifestUrl,priorVersion:'0.4.3',
  rollout:'owner-device-lab-only',webProductionChanged:false,backendStableChanged:false
},null,2)+'\n');
console.log('PASS OWNER_LAB_SIGNED_OTA_044_PUBLISHED',payload.bundleVersion,payload.sha256);
