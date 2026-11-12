import importlib.util,os,pathlib,tempfile,unittest,sys
from unittest.mock import patch
MODULE=pathlib.Path(__file__).resolve().parents[1]/'inventory_adapter.py'
sys.path.insert(0,str(MODULE.parent))
class RuntimeDiscovery(unittest.TestCase):
 def load(self):
  spec=importlib.util.spec_from_file_location('inventory_adapter',MODULE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_import_does_not_execute_tests(self):
  with patch('engine.execute_bounded',side_effect=AssertionError('IMPORT_EXECUTED')):self.load()
 def test_explicit_runtime_is_validated(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'node.exe';p.touch()
   with patch.dict(os.environ,{'MAINTRACK_NODE':str(p)}):self.assertEqual(self.load().resolve_node(),str(p.resolve()))
 def test_invalid_override_does_not_silently_fallback(self):
  with patch.dict(os.environ,{'MAINTRACK_NODE':'missing-node-path'}):
   with self.assertRaises(FileNotFoundError):self.load().resolve_node()
 def test_path_runtime_and_missing_runtime(self):
  with patch.dict(os.environ,{'MAINTRACK_NODE':''}),patch('shutil.which',return_value='/portable/node'):
   self.assertEqual(self.load().resolve_node(),'/portable/node')
  with patch.dict(os.environ,{'MAINTRACK_NODE':''}),patch('shutil.which',return_value=None):
   with self.assertRaises(FileNotFoundError):self.load().resolve_node()
 def test_no_personal_windows_path(self):self.assertNotIn('Users\\moham',MODULE.read_text())
