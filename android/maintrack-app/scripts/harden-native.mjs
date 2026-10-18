import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'android/app/src/main/AndroidManifest.xml');
let xml=fs.readFileSync(file,'utf8');
if(!/<application\b/.test(xml))throw Error('Android manifest unexpected');
for(const [name,value] of [['allowBackup','false'],['usesCleartextTraffic','false'],['networkSecurityConfig','@xml/maintrack_network_security']]){
 const pat=new RegExp('\\bandroid:'+name+'="[^"]*"');
 xml=pat.test(xml)?xml.replace(pat,'android:'+name+'="'+value+'"'):xml.replace(/<application\b/,'<application android:'+name+'="'+value+'"');
}
fs.writeFileSync(file,xml);
const location=path.join(root,'android/app/src/main/res/xml');fs.mkdirSync(location,{recursive:true});
fs.writeFileSync(path.join(location,'maintrack_network_security.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config></network-security-config>\n');

// Register the Keystore-backed bridge only in a newly built native APK.
const nativeDir=path.join(root,'android/app/src/main/java/com/icc/maintrack');
const activityFile=path.join(nativeDir,'MainActivity.java');
let activity=fs.readFileSync(activityFile,'utf8');
if(!activity.includes('registerPlugin(MainTrackSecureSessionPlugin.class)')){
 if(!/public class MainActivity extends BridgeActivity\s*\{/.test(activity)||/void onCreate\s*\(/.test(activity))
  throw Error('UNEXPECTED_MAIN_ACTIVITY_LAYOUT');
 activity=activity.replace(/public class MainActivity extends BridgeActivity\s*\{/,
  'public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(MainTrackSecureSessionPlugin.class);\n        super.onCreate(savedInstanceState);\n    }');
 fs.writeFileSync(activityFile,activity);
}
fs.copyFileSync(path.join(root,'native/MainTrackSecureSessionPlugin.java'),
  path.join(nativeDir,'MainTrackSecureSessionPlugin.java'));

console.log('Android manifest hardened; native session uses Android Keystore');
