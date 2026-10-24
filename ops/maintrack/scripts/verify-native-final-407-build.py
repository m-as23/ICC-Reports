"""Verify 047 Final identity and byte-exact shared Web/native assets."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[3]
APP=ROOT/'android/maintrack-app'
CANDIDATE=ROOT/'audit-output/final-047'
CERT='07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b'

def require(condition,reason):
 if not condition:raise ValueError('BLOCKED: '+reason)

def verify_apk_metadata(signature,badging):
 match=re.search(r'Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})',signature)
 require(match is not None and match.group(1).lower()==CERT,'OWNER_CERTIFICATE_MISMATCH')
 require(len(re.findall(r'Signer #\d+ certificate SHA-256 digest:',signature))==1,'UNEXPECTED_SIGNERS')
 for version in (2,3):
  require(re.search(r'Verified using v'+str(version)+r' scheme[^\n]*:\s*true',signature),'APK_V2_V3_SIGNATURE_REQUIRED')
 identity=re.search(r"^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'",badging,re.M)
 require(identity is not None and identity.groups()==('com.icc.maintrack','407','0.4.7'),'APK_ID_OR_VERSION_NOT_407')
 require('application-debuggable' not in badging,'DEBUGGABLE_APK_FORBIDDEN')

def reviewed():
 subprocess.run(['node','ops/maintrack/scripts/prepare-final-047.mjs','--verify'],cwd=ROOT,check=True)
 record=json.loads((CANDIDATE/'provenance.json').read_text())
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 require(record['sourceCommit']==head,'WRONG_SOURCE_COMMIT')
 return record

def native_source():
 spec=importlib.util.spec_from_file_location('previous405',Path(__file__).with_name('verify-native-405-build.py'))
 previous=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(previous)
 previous.verify_synced_asset_tree(CANDIDATE/'native/www',APP/'android/app/src/main/assets/public')
 java=APP/'android/app/src/main/java/com/icc/maintrack'
 require('registerPlugin(MainTrackSecureSessionPlugin.class)' in (java/'MainActivity.java').read_text(),'SECURE_SESSION_PLUGIN_MISSING')
 require('AndroidKeyStore' in (java/'MainTrackSecureSessionPlugin.java').read_text(),'KEYSTORE_SESSION_MISSING')
 manifest=(APP/'android/app/src/main/AndroidManifest.xml').read_text()
 for attr in ['android:allowBackup="false"','android:usesCleartextTraffic="false"','android:networkSecurityConfig="@xml/maintrack_network_security"']:
  require(attr in manifest,'NATIVE_SECURITY_DRIFT')
 gradle=(APP/'android/app/build.gradle').read_text()
 require(re.search(r'\bversionCode\s+407\b',gradle) and re.search(r'\bversionName\s+"0\.4\.7"',gradle),'GRADLE_VERSION_NOT_407')

def verify_platform_extras(names,read):
 # Locked Capacitor CLI emits only these two empty shims without Cordova plugins.
 require(names=={'cordova.js','cordova_plugins.js'},'APK_EXTRA_APPLICATION_ASSETS')
 for name in names:require(read(name)==b'','APK_PLATFORM_SHIM_TAMPERED')

def verify_signed(apk,sdk,output):
 record=reviewed()
 signature=subprocess.check_output([str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
 badging=subprocess.check_output([str(sdk/'aapt'),'dump','badging',str(apk)],text=True)
 verify_apk_metadata(signature,badging)
 expected={p.relative_to(CANDIDATE/'native/www').as_posix():p for p in (CANDIDATE/'native/www').rglob('*') if p.is_file()}
 with zipfile.ZipFile(apk) as archive:
  require(len(archive.namelist())==len(set(archive.namelist())),'APK_DUPLICATE_ENTRIES')
  for rel,file in expected.items():
   require(archive.read('assets/public/'+rel)==file.read_bytes(),'APK_ASSET_MISMATCH: '+rel)
  installed={p[len('assets/public/'):] for p in archive.namelist() if p.startswith('assets/public/') and not p.endswith('/')}
  verify_platform_extras(installed-set(expected),lambda rel:archive.read('assets/public/'+rel))
 record.update({'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkBytes':apk.stat().st_size,'signatureV2':True,'signatureV3':True,'certificateSha256':CERT,'deviceInstallTest':'NOT_RUN'})
 output.write_text(json.dumps(record,indent=2)+'\n')
 print('PASS signed Owner 047 APK, exact application assets and original certificate:',record['apkSha256'])

if __name__=='__main__':
 parser=argparse.ArgumentParser()
 parser.add_argument('--mode',choices=['android-sync','signed'],required=True)
 parser.add_argument('--apk',type=Path)
 parser.add_argument('--sdk-build-tools',type=Path)
 parser.add_argument('--provenance',type=Path)
 args=parser.parse_args()
 if args.mode=='android-sync':
  reviewed();native_source();print('PASS synced 407 native/session/source parity')
 else:
  require(args.apk and args.sdk_build_tools and args.provenance,'SIGNED_VERIFICATION_ARGUMENTS_REQUIRED')
  verify_signed(args.apk,args.sdk_build_tools,args.provenance)
