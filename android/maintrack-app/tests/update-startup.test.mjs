import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source=fs.readFileSync(path.resolve(import.meta.dirname,'../update-system/startup.mjs'),'utf8');
test('native readiness signalled early and isolated from all network checks',()=>{
 assert.match(source,/CapacitorUpdater\.notifyAppReady\(\)/);
 assert.match(source,/Capacitor\.isNativePlatform\(\)/);
 assert.doesNotMatch(source,/fetch\(|download\(|setUpdateUrl\(|getLatest\(/);
});
