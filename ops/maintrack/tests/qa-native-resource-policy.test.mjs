import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {prepareRegisteredNativeProfile} from '../scripts/prepare-registered-native-profile.mjs';
test('native profile cannot target a Production package or a directory outside the owned audit root',()=>{
 assert.throws(()=>prepareRegisteredNativeProfile(os.tmpdir()),/OWNED_QA_NATIVE_ROOT/);
 const audit=path.resolve(import.meta.dirname,'../../../audit-output');fs.mkdirSync(audit,{recursive:true});const dir=fs.mkdtempSync(path.join(audit,'qa-native-profile-test-'));
 try{for(const rel of ['app/src/main/java/com/icc/maintrack/qa','app/src/main/res/xml'])fs.mkdirSync(path.join(dir,rel),{recursive:true});fs.writeFileSync(path.join(dir,'app/build.gradle'),'android { namespace = "com.icc.maintrack"; defaultConfig { applicationId "com.icc.maintrack" } }');fs.writeFileSync(path.join(dir,'app/src/main/AndroidManifest.xml'),'PRODUCTION_FIXTURE_NOT_MODIFIABLE');assert.throws(()=>prepareRegisteredNativeProfile(dir),/QA_NATIVE_PACKAGE/);assert.equal(fs.readFileSync(path.join(dir,'app/src/main/AndroidManifest.xml'),'utf8'),'PRODUCTION_FIXTURE_NOT_MODIFIABLE');}
 finally{assert.ok(path.resolve(dir).startsWith(audit+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
test('QA native URL policy runs on a real JVM and rejects Production, redirects and spoofed hosts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintrack-qa-uri-'));
 try{const harness=path.join(dir,'QaPolicyCheck.java');fs.writeFileSync(harness,`import com.icc.maintrack.qa.MainTrackQaResourcePolicy;public class QaPolicyCheck{public static void main(String[] args){String[][] cases={
 {"https://localhost/index.html","true","true"},
 {"https://maintrack-registered-isolated-qa.vercel.app/api/login","false","true"},
 {"https://maintrack-registered-isolated-qa.vercel.app/api/core","false","true"},
 {"https://maintrack-registered-isolated-qa.vercel.app/.well-known/assetlinks.json","false","true"},
 {"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit","false","true"},
 {"https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-security-qa-inventory","false","true"},
 {"https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-final-047/api","false","false"},
 {"https://maintrack-final-security-qa.vercel.app/","false","false"},
 {"https://maintrack-registered-isolated-qa.vercel.app.evil.invalid/api/login","false","false"},
 {"https://evil.invalid@maintrack-registered-isolated-qa.vercel.app/api/login","false","false"},
 {"https://maintrack-registered-isolated-qa.vercel.app:8443/api/login","false","false"},
 {"http://maintrack-registered-isolated-qa.vercel.app/api/login","false","false"},
 {"https://maintrack-registered-isolated-qa.vercel.app/api/login","true","false"},
 {"https://maintrack-registered-isolated-qa.vercel.app/api/%63ore","false","false"},
 {"https://maintrack-registered-isolated-qa.vercel.app/api/core?target=production","false","false"},
 {"https://szhstrafzkxzstjdcynl.supabase.co/rest/v1/mt_users","false","false"}};
 for(String[] c:cases)if(MainTrackQaResourcePolicy.allowed(c[0],Boolean.parseBoolean(c[1]))!=Boolean.parseBoolean(c[2]))throw new RuntimeException(c[0]);System.out.println(cases.length+" QA URI cases PASS");}}`);
 const bin=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name+(process.platform==='win32'?'.exe':'')):name;
 execFileSync(bin('javac'),['-d',dir,new URL('../../../android/maintrack-app/native/MainTrackQaResourcePolicy.java',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''),harness],{windowsHide:true,timeout:20000});
 assert.match(execFileSync(bin('java'),['-cp',dir,'QaPolicyCheck'],{windowsHide:true,timeout:10000,encoding:'utf8'}),/16 QA URI cases PASS/);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
