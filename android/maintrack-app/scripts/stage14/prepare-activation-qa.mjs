// Build disposable QA fixtures locally on the runner. No upload, live API or keys.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {build} from 'esbuild';
import {canonicalJson} from '../../update-system/policy.mjs';
import {LOCAL_DATA_CONTRACT} from '../../update-system/data-contract.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, '.activation-qa');
fs.mkdirSync(output, {recursive:true});
const www = path.join(root, 'www');
await build({entryPoints:[path.join(import.meta.dirname,'activation-driver.mjs')],outfile:path.join(www,'activation-lab-driver.js'),
  bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,logLevel:'silent'});
const cleanIndex = fs.readFileSync(path.join(www,'index.html'),'utf8').replace('</body>','<script src="activation-lab-driver.js"></script></body>');
fs.writeFileSync(path.join(www,'index.html'),cleanIndex);
const payloads = {};
for (const name of ['healthy','faulty']) {
  const dir = path.join(output, name);
  fs.cpSync(www, dir, {recursive:true});
  if (name === 'faulty') {
    fs.writeFileSync(path.join(dir,'faulty-shell.js'), 'window.__BOUNDARY_FAULTY__=true;throw Error("QA intentional shell failure");');
    fs.writeFileSync(path.join(dir,'index.html'), cleanIndex.replace('<body>', '<body><script src="faulty-shell.js"></script>'));
  }
  const zip = path.join(output, name + '.zip');
  execFileSync('python3',['-c',
    'import zipfile,pathlib,sys\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(root).as_posix())', dir, zip]);
  const bytes = fs.readFileSync(zip), now = Date.now();
  payloads[name] = {schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+86400000,
    nativeMinimum:'0.2.0',nativeMaximum:'0.3.0',bundleVersion:name === 'healthy' ? '0.3.1' : '0.3.2',
    bundleUrl:'https://localhost:8443/' + name + '.zip',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
    localData:LOCAL_DATA_CONTRACT};
}
const {privateKey, publicKey} = generateKeyPairSync('ed25519');
const config = {publicKey:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url')};
for (const [name,payload] of Object.entries(payloads)) config[name] = {payload,signature:sign(null,Buffer.from(canonicalJson(payload)),privateKey).toString('base64url')};
fs.writeFileSync(path.join(www,'activation-lab-config.js'),'window.__BOUNDARY_LAB_CONFIG__=' + JSON.stringify(config) + ';');
fs.writeFileSync(path.join(www,'index.html'),cleanIndex.replace('<script src="activation-lab-driver.js">','<script src="activation-lab-config.js"></script><script src="activation-lab-driver.js">'));
const configFile = path.join(root,'capacitor.config.json');
const native = JSON.parse(fs.readFileSync(configFile,'utf8'));
// Disposable QA build: no telemetry or production update service.
Object.assign(native.plugins.CapacitorUpdater, {statsUrl:'',updateUrl:'',channelUrl:'',appReadyTimeout:10000});
fs.writeFileSync(configFile,JSON.stringify(native,null,2));
console.log('Prepared actual-UI native activation fixtures with ephemeral public trust, synthetic reports only.');
