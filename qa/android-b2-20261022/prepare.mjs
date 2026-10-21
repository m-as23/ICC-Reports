import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const old='https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api';
export const endpoint='https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-isolated-e2e-b2/api';
export function transformClient(js){assert.equal(js.split(old).length,2,'API_SOURCE_DRIFT');return js.replace(old,endpoint);}
export function transformHtml(html){assert.equal((html.match(/http-equiv="Content-Security-Policy"/g)||[]).length,1,'CSP_SOURCE_DRIFT');return html.replace(/connect-src [^;"\n]+/g,"connect-src 'none'").replace(/<script src="secure-assets\/stage15-pilot-update.js"><\/script>/g,'');}
export function isolateAssets(www){
 const js=path.join(www,'secure-assets/index-inline-1.js');fs.writeFileSync(js,transformClient(fs.readFileSync(js,'utf8')));
 const html=path.join(www,'index.html');fs.writeFileSync(html,transformHtml(fs.readFileSync(html,'utf8')));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=path.join(root,'android/maintrack-app');assert(!fs.existsSync(path.join(app,'www')),'FRESH_BUILD_COPY_REQUIRED');assert(!fs.existsSync(path.join(app,'android')),'FRESH_NATIVE_BUILD_REQUIRED');
 execFileSync(process.execPath,['ops/maintrack/scripts/prepare-native-405-qa.mjs','--prepare'],{cwd:root,stdio:'inherit'});
 const www=path.join(app,'www');fs.cpSync(path.join(root,'audit-output/native-405-qa/www'),www,{recursive:true});isolateAssets(www);
 const cfgFile=path.join(app,'capacitor.config.json'),cfg=JSON.parse(fs.readFileSync(cfgFile));assert.equal(cfg.appId,'com.icc.maintrack');cfg.appName='MainTrack B2 Native QA';cfg.plugins.CapacitorUpdater.autoUpdate='off';fs.writeFileSync(cfgFile,JSON.stringify(cfg,null,2)+'\n');
 if(process.argv.includes('--assets-only')){console.log('PASS isolated native assets; network disabled; no Android assembly');process.exit(0);}
 execFileSync('npx',['--no-install','cap','add','android'],{cwd:app,stdio:'inherit'});execFileSync('npx',['--no-install','cap','sync','android'],{cwd:app,stdio:'inherit'});execFileSync(process.execPath,['scripts/harden-native.mjs'],{cwd:app,stdio:'inherit'});
 const gradleFile=path.join(app,'android/app/build.gradle');let gradle=fs.readFileSync(gradleFile,'utf8');assert(gradle.includes('applicationId "com.icc.maintrack"'));assert(/buildTypes\s*\{/.test(gradle));gradle=gradle.replace(/buildTypes\s*\{/,'buildTypes {\n        debug { applicationIdSuffix ".b2lab" }').replace(/versionCode\s+\d+/,'versionCode 406').replace(/versionName\s+"[^"]+"/,'versionName "0.4.6-b2-nativeqa"');fs.writeFileSync(gradleFile,gradle);
 // Remove INTERNET from the final merged manifest, including library contributions.
 const manifest=path.join(app,'android/app/src/main/AndroidManifest.xml');let xml=fs.readFileSync(manifest,'utf8');if(!xml.includes('xmlns:tools='))xml=xml.replace('<manifest ','<manifest xmlns:tools="http://schemas.android.com/tools" ');xml=xml.replace(/<uses-permission\b[^>]*android:name="android.permission.INTERNET"[^>]*\/>/g,'');xml=xml.replace('</manifest>','<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />\n</manifest>');fs.writeFileSync(manifest,xml);
 console.log('PASS b2lab debug-only package; INTERNET removed; no release signing or backend access');
}
