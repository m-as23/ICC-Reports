// Disposable public configuration only. No update server or signing key is saved.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'maintrack-pilot-public-'));
try {
  const {publicKey} = generateKeyPairSync('ed25519');
  const config = {schema:1,channel:'lab', manifestUrl:'https://updates-lab.example.org/release.json',
    allowedOrigins:['https://updates-lab.example.org'],
    publicKeyBase64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url')};
  const file = path.join(temporary, 'public.json');
  await fs.writeFile(file, JSON.stringify(config));
  execFileSync(process.execPath, ['scripts/prepare-pilot-ui.mjs','--config',file], {cwd:root,stdio:'inherit'});
  const index = await fs.readFile(path.join(root,'www/index.html'),'utf8');
  assert(index.includes('<script src="secure-assets/stage15-pilot-update.js"></script>'));
  assert(index.includes("connect-src 'self' https://tdnkeskczcsukcujwinu.supabase.co https://updates-lab.example.org;"));
  const js = await fs.readFile(path.join(root,'www/secure-assets/stage15-pilot-update.js'),'utf8');
  assert(js.includes(config.publicKeyBase64));
  assert(!js.includes('__MAINTRACK_PILOT_CONFIG__'));
  console.log('PASS opt-in pilot bundle compiles with a pinned public config and scoped generated CSP');
} finally {
  await fs.rm(temporary, {recursive:true,force:true});
  // Ordinary candidates/browser acceptance must start from the standard snapshot.
  execFileSync(process.execPath, ['scripts/snapshot.mjs'], {cwd:root,stdio:'inherit'});
}
