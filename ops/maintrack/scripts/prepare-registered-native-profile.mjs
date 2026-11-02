// Applies only to an owned, copied QA build tree. Never modifies the lab harness,
// Production package, signing keys, sessions, emulator or connected device.
import fs from 'node:fs';import path from 'node:path';
export function prepareRegisteredNativeProfile(androidRoot){
 const repo=path.resolve(import.meta.dirname,'../../..'),root=fs.realpathSync(androidRoot),audit=path.join(repo,'audit-output')+path.sep;
 if(!root.startsWith(audit))throw Error('OWNED_QA_NATIVE_ROOT_REQUIRED');
 for(const relative of ['app/build.gradle','app/src/main/AndroidManifest.xml','app/src/main/java/com/icc/maintrack/qa','app/src/main/res/xml']){
  let at=path.join(root,relative);while(at!==root){if(fs.lstatSync(at).isSymbolicLink())throw Error('QA_NATIVE_REPARSE_POINT_DENIED');at=path.dirname(at);}
 }
 const gradle=fs.readFileSync(path.join(root,'app/build.gradle'),'utf8');
 if(!/applicationId\s+["']com\.icc\.maintrack\.qa["']/.test(gradle)||!/namespace\s*=\s*["']com\.icc\.maintrack\.qa["']/.test(gradle))throw Error('QA_NATIVE_PACKAGE_REQUIRED');
 const java=path.join(root,'app/src/main/java/com/icc/maintrack/qa'),activity=path.join(java,'MainActivity.java');let source=fs.readFileSync(activity,'utf8');
 if(source.split('new QaWebViewClient(getBridge())').length!==2||!source.includes('registerPlugin(MainTrackPasskeyPlugin.class)'))throw Error('QA_NATIVE_HARNESS_CONTRACT');
 source=source.replace('new QaWebViewClient(getBridge())','new MainTrackQaWebViewClient(getBridge())');
 for(const name of ['MainTrackQaWebViewClient.java','MainTrackQaResourcePolicy.java'])fs.copyFileSync(path.join(repo,'android/maintrack-app/native',name),path.join(java,name));
 const manifest=path.join(root,'app/src/main/AndroidManifest.xml'),xml=fs.readFileSync(manifest,'utf8');
 if(!xml.includes('android:usesCleartextTraffic="false"')||!xml.includes('android:allowBackup="false"')||!xml.includes('android:networkSecurityConfig="@xml/qa_network_security"'))throw Error('QA_NATIVE_MANIFEST_CONTRACT');
 fs.writeFileSync(activity,source);fs.writeFileSync(manifest,xml.replace('@xml/qa_network_security','@xml/maintrack_qa_system_network_security'));
 fs.writeFileSync(path.join(root,'app/src/main/res/xml/maintrack_qa_system_network_security.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config></network-security-config>\n');
 return {packageName:'com.icc.maintrack.qa',rpId:'maintrack-registered-isolated-qa.vercel.app',trust:'SYSTEM_ONLY',physicalAcceptance:'DEFERRED_BY_OWNER',releaseEligible:false};
}
