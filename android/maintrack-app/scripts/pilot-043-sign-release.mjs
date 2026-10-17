// Stage14 Owner pilot OTA 0.4.3: pinned-source, attestation and trust gate.
// No stable website or stable API writes. Publishing happens only in release environment.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {canonicalJson,compareVersions} from '../update-system/policy.mjs';
const repo='m-as23/ICC-Reports',branch='android/stage14-ota-native-lab';
const target='0.4.3',sourceSha='7290df3ad14e94b4680cb41a6634fba16ecc6af1';
const proofRun=39067610642,sourceRun=39067507471;
const p='pilot-043/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function same(a,b,label){if(a!==b)throw Error('PILOT_043_'+label);}
const loadJson=async name=>JSON.parse(await fs.readFile(p+name,'utf8'));
const config=JSON.parse(await fs.readFile('release/owner-public.json','utf8'));
same(config.channel,'lab','CHANNEL');
same(config.manifestUrl,'https://raw.githubusercontent.com/'+repo+'/'+branch+'/updates/android/release.json','DISCOVERY_URL');
const proof=await loadJson('owner-key-attestation.json');
const candidate=await loadJson('candidate.json');
const pilot=await loadJson('pilot-build.json');
same(candidate.gitCommit,sourceSha,'SOURCE_SHA');
same(candidate.branch,'feature/maintrack-unified-four-updates-20261017','FEATURE_BRANCH');
same(candidate.appId,'com.icc.maintrack','APP_ID');
same(candidate.mode,'review-only','CANDIDATE_MODE');
same(candidate.signed,false,'SOURCE_SIGNED');
same(candidate.deployable,false,'SOURCE_DEPLOYABLE');
same(candidate.rolloutEnabled,false,'SOURCE_ROLLOUT');
same(candidate.nativePilotUpdatePanel.pinnedPublicKey,config.publicKeyBase64,'EMBEDDED_OTA_KEY');
same(candidate.nativePilotUpdatePanel.trustedManifestUrl,config.manifestUrl,'EMBEDDED_MANIFEST');
same(candidate.localData.reportQueue,1,'REPORT_QUEUE');
same(candidate.localData.writesReportQueue,1,'REPORT_QUEUE_WRITE');
same(candidate.localData.migration,'none','LOCAL_MIGRATION');
async function verifyEntry(name,details){
 const b=await fs.readFile(p+name);
 same(b.length,details.bytes,'SIZE_'+name);
 same(sha(b),details.sha256,'SHA_'+name);
 return b;
}
for(const name of Object.keys(candidate.archives))await verifyEntry(name,candidate.archives[name]);
same(proof.payload.kind,'owner-reviewed-candidate-proof','ATTEST_KIND');
same(proof.payload.sourceCommit,sourceSha,'ATTEST_SOURCE');
same(proof.payload.sourceRunId,sourceRun,'ATTEST_RUN');
same(proof.payload.deployable,false,'ATTEST_DEPLOY');
same(proof.payload.rolloutEnabled,false,'ATTEST_ROLLOUT');
same(proof.payload.nativeUnsignedZip.sha256,candidate.archives['MainTrack-Android-OTA-UNSIGNED-REVIEW.zip'].sha256,'ATTEST_NATIVE');
same(proof.payload.webReviewZip.sha256,candidate.archives['MainTrack-Web-REVIEW-ONLY.zip'].sha256,'ATTEST_WEB');
same(proof.publicKeyBase64,config.publicKeyBase64,'ATTEST_KEY');
const pub=crypto.createPublicKey({key:Buffer.concat([
 Buffer.from('302a300506032b6570032100','hex'),
 Buffer.from(config.publicKeyBase64,'base64url')
]),format:'der',type:'spki'});
if(!crypto.verify(null,Buffer.from(canonicalJson(proof.payload)),pub,Buffer.from(proof.signature,'base64url')))
 throw Error('OWNER_ATTESTATION_SIGNATURE_INVALID');
same(pilot.sourceCommit,sourceSha,'PILOT_SOURCE_SHA');
same(pilot.sourceRunId,sourceRun,'PILOT_SOURCE_RUN');
same(pilot.version,target,'PILOT_VERSION');
same(pilot.appId,'com.icc.maintrack','PILOT_APP');
same(pilot.api,'maintrack-unified-four-qa','PILOT_API');
same(pilot.changedArchiveMembers.join(','),'secure-assets/index-inline-1.js','PILOT_SINGLE_REWRITE');
same(pilot.localData.migration,'none','PILOT_CONTRACT');
const bytes=await verifyEntry('maintrack-0.4.3.zip',pilot.archive);
if(bytes.length>15_000_000)throw Error('PILOT_ZIP_TOO_LARGE');
if(process.env.GITHUB_REF!=='refs/heads/'+branch||process.env.GITHUB_REPOSITORY!==repo)
 throw Error('WRONG_RELEASE_BRANCH');
const mode=process.argv[2];
if(mode!=='preflight'&&mode!=='publish')throw Error('USAGE_preflight_or_publish');
console.log('PASS owner-signed attestation, QA-only archive, pinned 0.4.3 metadata',sourceSha);
if(mode==='preflight'){console.log('PASS preflight only; mobile manifest untouched');process.exit(0);}
const pem=process.env.MT_OTA_PRIVATE_KEY_PEM;
if(!pem)throw Error('RELEASE_SIGNING_SECRET_MISSING');
const key=crypto.createPrivateKey({
 key:pem,passphrase:process.env.MT_OTA_PRIVATE_KEY_PASSWORD||undefined
});
same(crypto.createPublicKey(key).export({format:'der',type:'spki'})
 .subarray(-32).toString('base64url'),config.publicKeyBase64,'OWNER_PRIVATE_KEY_MISMATCH');
const token=process.env.GH_TOKEN;
if(!token)throw Error('GITHUB_RELEASE_TOKEN_MISSING');
async function api(path,method='GET',data){
 const response=await fetch('https://api.github.com/repos/'+repo+'/'+path,{
  method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
   'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
  body:data?JSON.stringify(data):undefined
 });
 if(response.status===404&&method==='GET')return null;
 if(!response.ok)throw Error('GITHUB_'+method+'_FAILED_'+response.status);
 return response.json();
}
const manifestPath='updates/android/release.json';
const old=await api('contents/'+manifestPath+'?ref='+encodeURIComponent(branch));
if(!old)throw Error('EXISTING_MANIFEST_NOT_FOUND');
const prev=JSON.parse(Buffer.from(old.content,'base64').toString('utf8'));
same(prev.payload?.bundleVersion,'0.4.2','MANIFEST_CONCURRENT_UPDATE');
same(prev.payload?.appId,'com.icc.maintrack','PREVIOUS_APP_ID');
if(compareVersions(target,prev.payload.bundleVersion)<=0)throw Error('NOT_NEWER');
const bundlePath='updates/android/maintrack-'+target+'.zip';
if(await api('contents/'+bundlePath+'?ref='+encodeURIComponent(branch)))
 throw Error('PILOT_BUNDLE_ALREADY_EXISTS_DO_NOT_OVERWRITE');
const uploaded=await api('contents/'+bundlePath,'PUT',{
 message:'release(pilot): immutable QA-only OTA 0.4.3 [skip ci]',
 branch,content:bytes.toString('base64')
});
const immutableCommit=uploaded.commit?.sha;
if(!/^[0-9a-f]{40}$/.test(immutableCommit))throw Error('IMMUTABLE_COMMIT_MISSING');
const bundleUrl='https://raw.githubusercontent.com/'+repo+'/'+immutableCommit+'/'+bundlePath;
let remoteDigestOk=false;
for(let i=0;i<8;i++){
 const response=await fetch(bundleUrl,{cache:'no-store'});
 if(response.ok){
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length===bytes.length&&sha(data)===sha(bytes)){remoteDigestOk=true;break;}
 }
 await new Promise(resolve=>setTimeout(resolve,1500));
}
if(!remoteDigestOk)throw Error('IMMUTABLE_BUNDLE_NOT_AVAILABLE_MANIFEST_UNCHANGED');
const now=Date.now();
const payload={
 schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',
 issuedAt:now-1000,expiresAt:now+6*86400000,
 nativeMinimum:'0.4.1',nativeMaximum:'0.4.99',bundleVersion:target,
 bundleUrl,sha256:sha(bytes),bytes:bytes.length,localData:candidate.localData,
 sourceCommit:sourceSha
};
const signature=crypto.sign(null,Buffer.from(canonicalJson(payload)),key).toString('base64url');
if(!crypto.verify(null,Buffer.from(canonicalJson(payload)),pub,Buffer.from(signature,'base64url')))
 throw Error('PILOT_SIGNATURE_VERIFICATION_FAILED');
const envelope={payload,signature};
await api('contents/'+manifestPath,'PUT',{
 message:'release(pilot): owner signed OTA 0.4.3 for installed QA device [skip ci]',
 branch,sha:old.sha,content:Buffer.from(JSON.stringify(envelope,null,2)+'\n').toString('base64')
});
await fs.mkdir('release-output',{recursive:true});
await fs.writeFile('release-output/pilot-0.4.3.json',JSON.stringify({
 release:envelope,immutableCommit,artifact:pilot,
 ownerAttestationRun:proofRun,reviewBuildRun:sourceRun
},null,2)+'\n');
console.log('PASS SIGNED AND PUBLISHED OWNER PILOT OTA',target,sha(bytes));
