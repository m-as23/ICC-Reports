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
console.log('Android manifest hardened');
