// Executed only in the owner-approved GitHub signing environment. Never prints key values.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {canonicalJson,compareVersions} from '../update-system/policy.mjs';
import {LOCAL_DATA_CONTRACT} from '../update-system/data-contract.mjs';
const repo='m-as23/ICC-Reports', branch='android/stage14-ota-native-lab';
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!==`refs/heads/${branch}`)throw Error('WRONG_RELEASE_TARGET');
const version=process.env.VERSION_NAME;
compareVersions(version,'0.0.0');
const config=JSON.parse(await fs.readFile('release/owner-public.json','utf8'));
const key=createPrivateKey({key:process.env.MT_OTA_PRIVATE_KEY_PEM,passphrase:process.env.MT_OTA_PRIVATE_KEY_PASSWORD});
if(createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64url')!==config.publicKeyBase64)throw Error('OWNER_OTA_KEY_MISMATCH');
async function api(path,method='GET',data){
 const r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{method,headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:data?JSON.stringify(data):undefined});
 if(r.status===404&&method==='GET')return null;
 if(!r.ok)throw Error(`GITHUB_RELEASE_WRITE_${r.status}`);
 return r.json();
}
const manifestPath='updates/android/release.json';
const old=await api(`contents/${manifestPath}?ref=${encodeURIComponent(branch)}`);
if(old){
 const prior=JSON.parse(Buffer.from(old.content,'base64').toString());
 if(compareVersions(version,prior.payload.bundleVersion)<0)throw Error('OTA_VERSION_MUST_NOT_DECREASE');
}
await fs.mkdir('release-output',{recursive:true});
const bundlePath=`updates/android/maintrack-${version}.zip`;
const exists=await api(`contents/${bundlePath}?ref=${encodeURIComponent(branch)}`);
let immutableCommit;
let bytes;
if(exists) {
 // Refresh metadata only if exactly the same source was previously published.
 const previous=JSON.parse(Buffer.from(old?.content||'','base64').toString());
 if(previous.payload?.sourceCommit!==process.env.GITHUB_SHA)throw Error('EXISTING_VERSION_IS_IMMUTABLE');
 const r=await fetch(previous.payload.bundleUrl);if(!r.ok)throw Error('EXISTING_BUNDLE_UNAVAILABLE');
 bytes=Buffer.from(await r.arrayBuffer());
 immutableCommit=previous.payload.bundleUrl.split('/')[5];
} else {
 execFileSync('python3',['-c',`import pathlib,zipfile
r=pathlib.Path('www')
with zipfile.ZipFile('release-output/ota.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(r.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(r).as_posix())`]);
 bytes=await fs.readFile('release-output/ota.zip');
 if(bytes.length>15000000)throw Error('OTA_TOO_LARGE');
 const result=await api(`contents/${bundlePath}`,'PUT',{message:`release(android): immutable OTA ${version} [skip ci]`,branch,content:bytes.toString('base64')});
 immutableCommit=result.commit.sha;
}
const now=Date.now();
const payload={schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+6*86400000,
 nativeMinimum:'0.4.1',nativeMaximum:'0.4.99',bundleVersion:version,
 bundleUrl:`https://raw.githubusercontent.com/${repo}/${immutableCommit}/${bundlePath}`,
 sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,localData:LOCAL_DATA_CONTRACT,sourceCommit:process.env.GITHUB_SHA};
const envelope={payload,signature:sign(null,Buffer.from(canonicalJson(payload)),key).toString('base64url')};
await api(`contents/${manifestPath}`,'PUT',{message:`release(android): signed discovery ${version} [skip ci]`,branch,content:Buffer.from(JSON.stringify(envelope,null,2)+'\n').toString('base64'),...(old?{sha:old.sha}:{})});
await fs.writeFile('release-output/ota-release.json',JSON.stringify(envelope,null,2)+'\n');
console.log(`PASS signed OTA ${version}: immutable ZIP published, checksum bound, six-day metadata validity; activation remains user-driven`);
