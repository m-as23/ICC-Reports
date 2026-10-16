// One-time public, expiring personal-device lab. Never a production signing key.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,generateKeyPairSync,sign,createPrivateKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonicalJson} from '../../update-system/policy.mjs';
import {LOCAL_DATA_CONTRACT} from '../../update-system/data-contract.mjs';

const root = path.resolve(import.meta.dirname,'../..');
const repo = path.resolve(root,'../..');
const output = path.join(repo,'qa/stage15-device');
const privateDir = path.join(root,'.device-pilot');
const branch = execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim();
if (branch !== 'android/stage14-ota-native-lab') throw Error('ISOLATED_BRANCH_REQUIRED');
const raw = 'https://raw.githubusercontent.com/m-as23/ICC-Reports/';
if (process.argv[2] === 'create') {
  if (fs.existsSync(output)) throw Error('EXISTING_LAB_MUST_NOT_BE_OVERWRITTEN');
  fs.mkdirSync(output,{recursive:true}); fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
  const {publicKey,privateKey} = generateKeyPairSync('ed25519');
  fs.writeFileSync(path.join(privateDir,'ephemeral-ota.pem'), privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  const config = {schema:1,channel:'lab',publicKeyBase64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url'),
    manifestUrl:raw+'android/stage14-ota-native-lab/qa/stage15-device/release.json', allowedOrigins:['https://raw.githubusercontent.com']};
  const publicPath = path.join(output,'public-config.json');
  fs.writeFileSync(publicPath,JSON.stringify(config,null,2)+'\n');
  execFileSync(process.execPath,['scripts/prepare-pilot-ui.mjs','--config',publicPath],{cwd:root,stdio:'inherit'});
  execFileSync('python3',['-c',
    'import pathlib,zipfile,sys\nr=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for p in sorted(r.rglob("*")):\n  if p.is_file():\n   i=zipfile.ZipInfo(p.relative_to(r).as_posix(),(2026,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,p.read_bytes())',
    path.join(root,'www'),path.join(output,'healthy-0.3.1.zip')]);
  console.log('Created public lab config and healthy OTA archive; ephemeral private key stays ignored');
} else if (process.argv[2] === 'sign') {
  const commit = process.argv[3];
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw Error('IMMUTABLE_FIXTURE_COMMIT_REQUIRED');
  const zip = fs.readFileSync(path.join(output,'healthy-0.3.1.zip'));
  const now = Date.now();
  const payload = {schema:1,channel:'lab',kind:'web-ota',appId:'com.icc.maintrack',issuedAt:now-1000,expiresAt:now+6*86400000,
    nativeMinimum:'0.3.0',nativeMaximum:'0.3.2',bundleVersion:'0.3.1',
    bundleUrl:raw+commit+'/qa/stage15-device/healthy-0.3.1.zip',sha256:createHash('sha256').update(zip).digest('hex'),bytes:zip.length,
    localData:LOCAL_DATA_CONTRACT};
  const privateKey = createPrivateKey(fs.readFileSync(path.join(privateDir,'ephemeral-ota.pem')));
  fs.writeFileSync(path.join(output,'release.json'),JSON.stringify({payload,signature:sign(null,Buffer.from(canonicalJson(payload)),privateKey).toString('base64url')},null,2)+'\n');
  fs.rmSync(path.join(privateDir,'ephemeral-ota.pem'));
  console.log('Signed six-day laboratory manifest for immutable archive; ephemeral private key removed');
} else throw Error('USE_create_OR_sign_COMMIT');
