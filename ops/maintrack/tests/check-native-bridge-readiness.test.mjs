import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNativeBridgeBundle,REQUIRED_BRIDGE} from '../scripts/check-native-bridge-readiness.mjs';
const html='<head><script src="secure-assets/stage13-native-ready.js"></script><script src="secure-assets/stage14-local-work.js"></script><script src="'+REQUIRED_BRIDGE+'"></script></head><body><script src="secure-assets/index-inline-1.js"></script></body>';
test('native bridge readiness admits required protected session script in correct order',()=>{
 assert.equal(inspectNativeBridgeBundle({html,files:[REQUIRED_BRIDGE]}).ok,true);
});
test('missing secure session script reference blocks Android 405',()=>{
 assert.throws(()=>inspectNativeBridgeBundle({html:html.replace(REQUIRED_BRIDGE,'missing.js'),files:[REQUIRED_BRIDGE]}),
 /ANDROID_SECURE_SESSION_BRIDGE_NOT_REFERENCED/);
});
test('missing secure session asset blocks even when index references it',()=>{
 assert.throws(()=>inspectNativeBridgeBundle({html,files:['index.html']}),
 /ANDROID_SECURE_SESSION_BRIDGE_ASSET_MISSING/);
});
test('secure session bridge loaded after main application blocks',()=>{
 const late=html.replace('<script src="'+REQUIRED_BRIDGE+'"></script>','').replace('</body>','<script src="'+REQUIRED_BRIDGE+'"></script></body>');
 assert.throws(()=>inspectNativeBridgeBundle({html:late,files:[REQUIRED_BRIDGE]}),
 /ANDROID_SECURE_SESSION_BRIDGE_LOADED_AFTER_APP/);
});
test('missing offline work bridge blocks',()=>{
 assert.throws(()=>inspectNativeBridgeBundle({html:html.replace('stage14-local-work.js','absent.js'),files:[REQUIRED_BRIDGE]}),
 /NATIVE_OFFLINE_WORK_BRIDGE_MISSING/);
});
test('missing OTA startup blocks',()=>{
 assert.throws(()=>inspectNativeBridgeBundle({html:html.replace('stage13-native-ready.js','absent.js'),files:[REQUIRED_BRIDGE]}),
 /NATIVE_OTA_BOOTSTRAP_MISSING/);
});
