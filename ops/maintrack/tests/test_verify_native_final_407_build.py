import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('final407',Path(__file__).parents[1]/'scripts/verify-native-final-407-build.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class FinalPlatformAssets(unittest.TestCase):
 def test_only_expected_empty_cordova_shims_are_accepted(self):
  names={'cordova.js','cordova_plugins.js'}
  module.verify_platform_extras(names,lambda name:b'')
  with self.assertRaisesRegex(ValueError,'APK_PLATFORM_SHIM_TAMPERED'):
   module.verify_platform_extras(names,lambda name:b'alert(1)')
  with self.assertRaisesRegex(ValueError,'APK_EXTRA_APPLICATION_ASSETS'):
   module.verify_platform_extras(names|{'capacitor.js'},lambda name:b'')

if __name__=='__main__':unittest.main()
