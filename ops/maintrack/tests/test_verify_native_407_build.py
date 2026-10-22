import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('verify407',Path(__file__).resolve().parents[1]/'scripts/verify-native-407-build.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Owner407Identity(unittest.TestCase):
 def test_rejects_downgrade_wrong_signer_or_weak_signature(self):
  signature=f'Signer #1 certificate SHA-256 digest: {module.CERT}\nVerified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\n'
  badge="package: name='com.icc.maintrack' versionCode='407' versionName='0.4.7'\n"
  module.verify_apk_metadata(signature,badge)
  for bad_signature,bad_badge in [(signature,badge.replace("'407'","'406'")),(signature.replace(module.CERT,'0'*64),badge),(signature.replace(': true',': false'),badge),(signature,badge+'application-debuggable\n')]:
   with self.subTest(signature=bad_signature[:20],badge=bad_badge):
    with self.assertRaises(ValueError):module.verify_apk_metadata(bad_signature,bad_badge)
