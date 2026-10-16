// Opt-in generated www only. Shared approved resources are never edited.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {validatePilotConfig} from '../update-system/pilot-session.mjs';

const root = path.resolve(import.meta.dirname, '..');
if (process.argv.length !== 4 || process.argv[2] !== '--config') throw Error('PUBLIC_PILOT_CONFIG_FILE_REQUIRED');
const head = execFileSync('git', ['rev-parse','HEAD'], {cwd:root, encoding:'utf8'}).trim();
const branch = execFileSync('git', ['branch','--show-current'], {cwd:root, encoding:'utf8'}).trim();
if (branch !== 'android/stage14-ota-native-lab' && !(process.env.GITHUB_REF === 'refs/heads/android/stage14-ota-native-lab'
  && process.env.GITHUB_SHA === head)) throw Error('ISOLATED_BRANCH_REQUIRED');
const config = validatePilotConfig(JSON.parse(await fs.readFile(path.resolve(process.argv[3]), 'utf8')));
execFileSync(process.execPath, ['scripts/snapshot.mjs'], {cwd:root, stdio:'inherit'});
await build({entryPoints:[path.join(root, 'update-system/pilot-entry.mjs')],
  outfile:path.join(root, 'www/secure-assets/stage15-pilot-update.js'), bundle:true,
  format:'iife', platform:'browser', target:'es2022', minify:true,
  define:{__MAINTRACK_PILOT_CONFIG__:JSON.stringify(config)}});
await fs.copyFile(path.join(root, 'update-system/pilot-panel.css'), path.join(root, 'www/secure-assets/stage15-pilot-update.css'));
const file = path.join(root, 'www/index.html');
let index = await fs.readFile(file, 'utf8');
const origin = new URL(config.manifestUrl).origin;
const pattern = /connect-src 'self' https:\/\/tdnkeskczcsukcujwinu\.supabase\.co;/;
if (!pattern.test(index)) throw Error('UNEXPECTED_GENERATED_CSP');
index = index.replace(pattern, `connect-src 'self' https://tdnkeskczcsukcujwinu.supabase.co ${origin};`);
index = index.replace('</body>', '<script src="secure-assets/stage15-pilot-update.js"></script></body>');
await fs.writeFile(file, index);
console.log('PASS opt-in laboratory update panel generated; no production channel or background check enabled');
