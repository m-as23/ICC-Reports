// Isolated, non-upgradeable Android session QA: no production server or OTA release.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const review=path.join(root,'unified-four-review/native/www');
const dest=path.join(root,'www');
if(!fs.existsSync(path.join(review,'index.html')))throw Error('REVIEW_CANDIDATE_NOT_BUILT');
fs.cpSync(review,dest,{recursive:true,force:true});
const jsPath=path.join(dest,'secure-assets/index-inline-1.js');
let js=fs.readFileSync(jsPath,'utf8');
const stable='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api';
const qa='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
if(js.split(stable).length!==2||js.includes(qa))throw Error('SOURCE_API_UNEXPECTED');
js=js.replace(stable,qa);
fs.writeFileSync(jsPath,js);
const indexPath=path.join(dest,'index.html');
let html=fs.readFileSync(indexPath,'utf8');
const panel='<script src="secure-assets/stage15-pilot-update.js"></script>';
if(!html.includes(panel))throw Error('PILOT_UPDATE_PANEL_NOT_FOUND');
html=html.replace(panel,'');
if(html.includes('🧪 PILOT — بلاغات تجريبية فقط'))throw Error('PILOT_BANNER_RETURNED');
fs.writeFileSync(indexPath,html);
const configPath=path.join(root,'capacitor.config.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.appId!=='com.icc.maintrack')throw Error('SOURCE_APP_ID_CHANGED');
// Keep the source package/Java namespace so native plugin registration remains valid.
// Only the Debug APK's installed Android identity gets a suffix.
config.appName='MainTrack Session QA';
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
execFileSync('npx',['cap','add','android'],{cwd:root,stdio:'inherit'});
execFileSync('npx',['cap','sync','android'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['scripts/harden-native.mjs'],{cwd:root,stdio:'inherit'});
const gradlePath=path.join(root,'android/app/build.gradle');
let gradle=fs.readFileSync(gradlePath,'utf8');
if(!/applicationId "com\.icc\.maintrack"/.test(gradle))throw Error('GENERATED_APP_ID_MISMATCH');
if(!/buildTypes\s*\{/.test(gradle))throw Error('ANDROID_BUILD_TYPES_MISSING');
gradle=gradle.replace(/buildTypes\s*\{/,'buildTypes {\n        debug { applicationIdSuffix ".sessionlab" }');
gradle=gradle.replace(/versionCode\s+\d+/,'versionCode 404')
 .replace(/versionName\s+"[^"]+"/,'versionName "0.4.4-sessionqa"');
fs.writeFileSync(gradlePath,gradle);
console.log('PASS isolated session QA: QA-only backend, disabled OTA panel, separate app ID, encrypted native plugin');
