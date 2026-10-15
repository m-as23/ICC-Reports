import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source=fs.readFileSync(path.resolve(import.meta.dirname,'../update-system/startup.mjs'),'utf8');
test('native readiness requires a locally loaded shell and remains isolated from network checks',()=>{
 assert.match(source,/CapacitorUpdater\.notifyAppReady\(\)/);
 assert.match(source,/Capacitor\.isNativePlatform\(\)/);
 assert.match(source,/createBootHealth/);
 assert.match(source,/__MainTrackV7Fix/);
 assert.doesNotMatch(source,/fetch\(|download\(|setUpdateUrl\(|getLatest\(/);
});
