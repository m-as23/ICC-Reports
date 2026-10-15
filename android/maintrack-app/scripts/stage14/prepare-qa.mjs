// Stage14 test release is signed with an EPHEMERAL key generated on each GitHub Actions job.
// The public key is embedded into the QA-only test APK and is NEVER a production signing key.
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {canonicalJson} from '../../update-system/policy.mjs';
const scenario=process.env.QA_SCENARIO;
const sha=process.env.QA_SOURCE_COMMIT;
if(!['healthy','faulty'].includes(scenario)||!/^[0-9a-f]{40}$/.test(sha))throw Error('INVALID_QA_CONFIGURATION');
const root=path.resolve(import.meta.dirname,'..');
const fixtures=JSON.parse(fs.readFileSync(path.resolve(root,'../../qa/stage14/fixtures.json')));
const f=fixtures[scenario];
const url='https://raw.githubusercontent.com/m-as23/ICC-Reports/'+sha+'/qa/stage14/'+scenario+'.zip';
const now=Date.now();
const payload={
  schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',
  issuedAt:now-120000,expiresAt:now+86400000,
  nativeMinimum:'0.2.0',nativeMaximum:'0.3.0',
  bundleVersion:scenario==='healthy'?'0.3.1':'0.3.2',
  bundleUrl:url,sha256:f.sha256,bytes:f.bytes
};
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const envelope={payload,signature:sign(null,Buffer.from(canonicalJson(payload)),privateKey).toString('base64url')};
const key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');
const config={scenario,envelope,publicKey:key};
const www=path.join(root,'www');
fs.writeFileSync(path.join(www,'index.html'),'<html><head><meta name="viewport" content="width=device-width"><meta charset="utf-8"></head><body><h2>MainTrack Stage14 OTA Native Laboratory (NO REAL USER DATA)</h2><script src="stage14-qa.js"></script></body></html>');
await build({
  entryPoints:[path.join(root,'scripts/stage14/qa-entry.mjs')],
  outfile:path.join(www,'stage14-qa.js'),
  bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,
  define:{'__STAGE14_CONFIG__':JSON.stringify(config)},logLevel:'silent'
});
console.log('STAGE14 QA-only APK prepared. Version '+payload.bundleVersion+' manifest signed with ephemeral key and pinned bundle SHA256 '+f.sha256);
