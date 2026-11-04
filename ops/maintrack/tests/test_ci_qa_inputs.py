import importlib.util, pathlib, tempfile, unittest, json, shutil, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('qa_inputs',ROOT/'ops/maintrack/scripts/prepare-ci-qa-android.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InputsTest(unittest.TestCase):
 def test_packaged_registered_browser_client_matches_current_security_source(self):
  with zipfile.ZipFile(m.INPUTS/'registered-qa-source.zip') as z:
   self.assertEqual(z.read('app/src/main/assets/public/secure-assets/registered-login-client.mjs'),(ROOT/'ops/maintrack/security/registered-login-client.mjs').read_bytes())
 def test_verified_source_can_be_prepared_without_keys(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'audit-output') as t:
   out=pathlib.Path(t)/'native';r=m.prepare(out);self.assertEqual(r['package'],'com.icc.maintrack.qa');self.assertTrue((out/'gradlew').is_file());self.assertNotIn('signingConfigs', (out/'app/build.gradle').read_text());self.assertFalse(list(out.rglob('*.keystore')))
 def test_changed_archive_is_rejected(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'audit-output') as t:
   p=pathlib.Path(t);shutil.copytree(m.INPUTS,p/'inputs');a=p/'inputs/registered-qa-source.zip';a.write_bytes(a.read_bytes()+b'changed');self.assertRaisesRegex(ValueError,'ARCHIVE_SHA256',m.prepare,p/'native',p/'inputs')
 def test_existing_and_outside_outputs_are_rejected(self):
  self.assertRaises(ValueError,m.prepare,ROOT/'android/maintrack-app')
  with tempfile.TemporaryDirectory(dir=ROOT/'audit-output') as t:self.assertRaises(ValueError,m.prepare,pathlib.Path(t))
