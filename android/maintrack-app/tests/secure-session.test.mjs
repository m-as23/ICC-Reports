import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');

test('native-only session never downgrades to plaintext persistent browser storage',()=>{
  const js=source('web/maintrack/public/secure-assets/index-inline-1.js');
  assert.doesNotThrow(()=>new Function(js));
  assert.match(js,/mtSecureSession/);
  assert.match(js,/await secure\.read\(\)/);
  assert.match(js,/await save\(d\)/);
  assert.match(js,/MT_LOGOUT_GUARD/);
  assert.match(js,/mtQueueNativeWrite\(\(\) => secure\.clear\(\)\)/);
  assert.doesNotMatch(js,/localStorage\.setItem\(['"]s['"]/);
  assert.doesNotMatch(js,/localStorage\.setItem\(['"]token['"]/);
});

test('session encryption is native Keystore AES-GCM, with no plaintext fallback',()=>{
  const java=source('android/maintrack-app/native/MainTrackSecureSessionPlugin.java');
  const hardened=source('android/maintrack-app/scripts/harden-native.mjs');
  const bridge=source('android/maintrack-app/update-system/native-session-entry.mjs');
  assert.match(java,/AndroidKeyStore/);
  assert.match(java,/AES\/GCM\/NoPadding/);
  assert.match(java,/GCMParameterSpec\(128, nonce\)/);
  assert.match(java,/setRandomizedEncryptionRequired\(true\)/);
  assert.match(java,/Base64\.encodeToString\(payload/);
  assert.match(hardened,/registerPlugin\(MainTrackSecureSessionPlugin\.class\)/);
  assert.match(bridge,/Capacitor\.isNativePlatform\(\)/);
  assert.match(bridge,/Capacitor\.isPluginAvailable\('MainTrackSecureSession'\)/);
  assert.doesNotMatch(java,/Log\.|System\.out/);
});

test('both candidate builders include native bridge and strip Pilot overlay',()=>{
  const review=source('android/maintrack-app/scripts/unified-four-review.py');
  const pilot=source('android/maintrack-app/scripts/prepare-pilot-ui.mjs');
  assert.match(review,/remove_pilot_badge\(\(native \/ "index.html"\)/);
  assert.match(review,/remove_pilot_badge\(\(web \/ "index.html"\)/);
  assert.match(review,/PILOT_BADGE_IN_DELIVERY_ARCHIVE/);
  assert.match(review,/stage20-native-session.js/);
  assert.match(pilot,/removePilotNote/);
  assert.match(pilot,/stage20-native-session.js/);
});
