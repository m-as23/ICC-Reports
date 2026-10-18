import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyLabRelease,validateLabRelease} from '../update-system/ota-lab.mjs';
import {acceptsLocalDataContract} from '../update-system/data-contract.mjs';
import {canonicalJson} from '../update-system/policy.mjs';
import {createPublicKey,verify as nodeVerify,webcrypto} from 'node:crypto';

const root = path.resolve(import.meta.dirname,'..');
const manifestPath = path.resolve(root,'../../updates/android/release.json');
const configPath = path.join(root,'release/owner-public.json');
const read = async () => ({
 manifest: JSON.parse(await fs.readFile(manifestPath,'utf8')),
 config: JSON.parse(await fs.readFile(configPath,'utf8'))
});

test('published 0.4.3 OTA signature verifies under exact key embedded in installed owner application',async()=>{
 const {manifest,config}=await read();
 assert.equal(manifest.payload.bundleVersion,'0.4.3');
 assert.equal(config.channel,'lab');
 assert.equal(config.manifestUrl,
   'https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json');
 assert.deepEqual(config.allowedOrigins,['https://raw.githubusercontent.com']);
 assert.match(config.publicKeyBase64,/^[A-Za-z0-9_-]{43}$/);
 const pub=Buffer.from(config.publicKeyBase64,'base64url');
 const spki=Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pub]);
 const nodeKey=createPublicKey({key:spki,format:'der',type:'spki'});
 assert.equal(nodeVerify(null,Buffer.from(canonicalJson(manifest.payload)),
  nodeKey,Buffer.from(manifest.signature,'base64url')),true);
 const opts={publicKeyBase64:config.publicKeyBase64,allowedOrigins:config.allowedOrigins,
  currentNative:'0.4.1',cryptoSubtle:webcrypto.subtle,now:manifest.payload.issuedAt+10000};
 assert.ok(await verifyLabRelease(manifest,opts),'existing installed native 0.4.1 must trust owner manifest');
 assert.ok(acceptsLocalDataContract(manifest.payload.localData));
 assert.match(manifest.payload.bundleUrl,
  /^https:\/\/raw\.githubusercontent\.com\/m-as23\/ICC-Reports\/[0-9a-f]{40}\/updates\/android\/maintrack-0\.4\.3\.zip$/);
 assert.match(manifest.payload.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(manifest.payload.appId,'com.icc.maintrack');
 assert.equal(manifest.payload.nativeMinimum,'0.4.1');
 assert.equal(manifest.payload.nativeMaximum,'0.4.99');
});

test('signed owner release is invalid after tampering or on unsupported native version',async()=>{
 const {manifest,config}=await read();
 const opts={publicKeyBase64:config.publicKeyBase64,allowedOrigins:config.allowedOrigins,
  currentNative:'0.4.1',now:manifest.payload.issuedAt+10000};
 const forged={...manifest,payload:{...manifest.payload,bundleVersion:'0.4.4'}};
 assert.equal(await verifyLabRelease(forged,opts),null);
 assert.equal(validateLabRelease(manifest.payload,{...opts,currentNative:'0.5.0'}),false);
 assert.equal(validateLabRelease(manifest.payload,{...opts,currentNative:'0.4.0'}),false);
 assert.equal(await verifyLabRelease(manifest,{...opts,now:manifest.payload.expiresAt+1}),null);
});
