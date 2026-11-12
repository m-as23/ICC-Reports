// Build-time wiring only. Does not activate an RP, enroll credentials or sign APKs.
import fs from 'node:fs';
import path from 'node:path';
const template=new URL('../native/MainTrackPasskeyPlugin.java',import.meta.url);
export function installPasskeyBridge(androidRoot,{packageName='com.icc.maintrack',rpId=''}={}){
 if(!['com.icc.maintrack','com.icc.maintrack.qa'].includes(packageName))throw Error('PASSKEY_PACKAGE_IDENTITY_REQUIRED');
 if(typeof rpId!=='string'||(rpId!==''&&(!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(rpId)||/^\d+(?:\.\d+){3}$/.test(rpId))))throw Error('PASSKEY_RP_HOST_REQUIRED');
 const app=path.join(androidRoot,'app'),java=path.join(app,'src/main/java',...packageName.split('.'));
 const activityFile=path.join(java,'MainActivity.java'),gradleFile=path.join(app,'build.gradle');
 let activity=fs.readFileSync(activityFile,'utf8'),gradle=fs.readFileSync(gradleFile,'utf8');
 const secure='registerPlugin(MainTrackSecureSessionPlugin.class)',passkey='registerPlugin(MainTrackPasskeyPlugin.class)';
 if(!activity.includes('package '+packageName+';')||activity.split(secure).length!==2||activity.split(passkey).length>2)throw Error('PASSKEY_ACTIVITY_CONTRACT_REQUIRED');
 if(!activity.includes(passkey))activity=activity.replace(secure,passkey+';\n        '+secure);
 const additions=[];
 for(const artifact of ['credentials','credentials-play-services-auth']){
  const coordinate='androidx.credentials:'+artifact+':';
  const versions=[...gradle.matchAll(new RegExp('\\bimplementation\\s*(?:\\(\\s*)?[\'\"]androidx\\.credentials:'+artifact+':([^\'\"]+)[\'\"]','g'))];
  if(versions.length>1||versions.some(m=>m[1]!=='1.6.0')||(gradle.includes(coordinate)&&!versions.length))throw Error('PASSKEY_DEPENDENCY_VERSION_REQUIRED');
  if(!versions.length)additions.push("    implementation '"+coordinate+"1.6.0'");
 }
 if(additions.length){if((gradle.match(/^dependencies\s*\{/gm)||[]).length!==1)throw Error('PASSKEY_GRADLE_LAYOUT_REQUIRED');gradle=gradle.replace(/^dependencies\s*\{/m,'dependencies {\n'+additions.join('\n'));}
 const source=fs.readFileSync(template,'utf8');
 if(!source.includes('REVIEWED_RP_ID = ""'))throw Error('PASSKEY_TEMPLATE_ACTIVATION_REQUIRES_REVIEW');
 // Validate everything before writing any generated build output.
 // This public compile-time pin cannot be changed by JS requests. Supplying it
 // is not an approval receipt; the release gate must review the resulting APK.
 fs.writeFileSync(path.join(java,'MainTrackPasskeyPlugin.java'),source.replace('package com.icc.maintrack;','package '+packageName+';').replace('REVIEWED_RP_ID = ""','REVIEWED_RP_ID = '+JSON.stringify(rpId)));
 fs.writeFileSync(activityFile,activity);fs.writeFileSync(gradleFile,gradle);
 return {packageName,dependency:'androidx.credentials:1.6.0',rpConfigured:rpId!=='',approvalConferred:false,signingAuthorized:false};
}
