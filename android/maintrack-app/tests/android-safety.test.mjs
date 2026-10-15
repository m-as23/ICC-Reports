import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('Capacitor uses local protected origin',()=>{const c=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json')));assert.equal(c.server.hostname,'localhost');assert.equal(c.server.androidScheme,'https');assert.equal(c.server.url,undefined);assert.equal(c.android.allowMixedContent,false)});
test('App uses reviewed Stage9 source URL',()=>{const s=fs.readFileSync(path.join(root,'scripts/snapshot.mjs'),'utf8');assert.match(s,/maintrack-final-security-qa\.vercel\.app/);assert.match(s,/maintrack-stage9-security-api\/api/);assert.match(s,/SECURITY_REPORT_MISMATCH/)});
test('Native security defaults cannot silently regress',()=>{const s=fs.readFileSync(path.join(root,'scripts/harden-native.mjs'),'utf8');assert.match(s,/allowBackup/);assert.match(s,/usesCleartextTraffic/);assert.match(s,/maintrack_network_security/)});
