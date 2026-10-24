// Protected environment only. Produces signed metadata; never publishes discovery.
import fs from 'node:fs/promises';import path from 'node:path';
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyFinal047,defaultTarget} from './prepare-final-047.mjs';
import {canonicalJson} from '../../../android/maintrack-app/update-system/policy.mjs';
import {verifyLabRelease} from '../../../android/maintrack-app/update-system/ota-lab.mjs';
import {LOCAL_DATA_CONTRACT} from '../../../android/maintrack-app/update-system/data-contract.mjs';
export function finalBaseline(policy,sourceCommit,now){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const bundleVersion=policy.bundleVersion||'0.4.7';assert.ok(['0.4.7','0.4.8','0.4.9'].includes(bundleVersion));
 assert.match(policy.bundleUrl,/^https:\/\/raw\.githubusercontent\.com\/m-as23\/ICC-Reports\/[a-f0-9]{40}\/updates\/android\/maintrack-0\.4\.[789]-final\.zip$/);
 assert.ok(policy.bundleUrl.endsWith('/maintrack-'+bundleVersion+'-final.zip'));
 assert.match(policy.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(policy.bytes)&&policy.bytes>100&&policy.bytes<15000000);
 return {schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+6*86400000,nativeMinimum:'0.4.7',nativeMaximum:'0.4.99',bundleVersion,bundleUrl:policy.bundleUrl,sha256:policy.sha256,bytes:policy.bytes,localData:LOCAL_DATA_CONTRACT,sourceCommit};
}
async function main(){
 assert.equal(process.env.GITHUB_REPOSITORY,'m-as23/ICC-Reports');
 assert.equal(process.env.GITHUB_REF,'refs/heads/release/maintrack-047-final-20261024');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(head,process.env.GITHUB_SHA);
 await verifyFinal047();
 const policy=JSON.parse(await fs.readFile('ops/maintrack/security/final-047-ota-source.json','utf8'));
 const payload=finalBaseline(policy,head,Date.now());
 const response=await fetch(payload.bundleUrl,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,payload.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),payload.sha256);
 execFileSync('python3',['-c',`import sys,io,zipfile,pathlib
r=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 names=z.namelist();expected={p.relative_to(r).as_posix():p for p in r.rglob('*') if p.is_file()}
 assert len(names)==len(set(names)) and set(names)==set(expected),'OTA_FILE_LIST_MISMATCH'
 for name,p in expected.items():
  assert z.getinfo(name).file_size==p.stat().st_size and z.read(name)==p.read_bytes(),'OTA_BYTES_MISMATCH: '+name
`,path.join(defaultTarget,'native/www')],{input:bytes});
 const config=JSON.parse(await fs.readFile('android/maintrack-app/release/owner-public.json','utf8'));
 const key=createPrivateKey({key:process.env.MT_OTA_PRIVATE_KEY_PEM,passphrase:process.env.MT_OTA_PRIVATE_KEY_PASSWORD||undefined});
 assert.equal(createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),config.publicKeyBase64,'OWNER_OTA_KEY_MISMATCH');
 const envelope={payload,signature:sign(null,Buffer.from(canonicalJson(payload)),key).toString('base64url')};
 assert.ok(await verifyLabRelease(envelope,{...config,currentNative:'0.4.7'}));
 await fs.writeFile('release-output/ota-release.json',JSON.stringify(envelope,null,2)+'\n');
 console.log('PASS signed 047 baseline, immutable exact native bytes; pre-047 native clients excluded; no discovery published');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
