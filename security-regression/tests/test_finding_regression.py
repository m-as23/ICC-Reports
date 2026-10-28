"""Known MT-SEC-001/004 gaps cannot inherit unrelated historic PASS evidence."""
import contextlib,copy,io,json,pathlib,sys,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from engine import select_impacted
import test_release_gate as gate_fixture
import finding_tests

class FindingClosureTests(unittest.TestCase):
 setUp=gate_fixture.GateTests.setUp
 bind_cleanup=gate_fixture.GateTests.bind_cleanup
 result=gate_fixture.GateTests.result
 def test_missing_login_or_excel_closure_proof_blocks_release(self):
  for case in ('login-rate-isolation','login-admission-policy','excel-dependency-review'):
   with self.subTest(case=case):
    record=copy.deepcopy(self.record);record['cases'].pop(case,None)
    self.assertEqual(self.result(record),'NO-GO')

class DependencySelectionTests(unittest.TestCase):
 def test_lock_change_selects_parser_without_retesting_cron(self):
  cases=json.loads((pathlib.Path(__file__).resolve().parents[1]/'catalog.json').read_text())['cases']
  selected=select_impacted(cases,['ops/maintrack/inventory/backend/package-lock.json'])
  self.assertIn('excel-dependency-local',selected)
  self.assertIn('inventory-xlsx-new-item',selected)
  self.assertNotIn('cleanup-postgres',selected)

class FindingRunnerSafetyTests(unittest.TestCase):
 def test_missing_remote_and_parameter_overridden_databases_never_execute(self):
  for url in ('','postgres://mt_local_admin@remote.invalid/maintrack_auth_local','postgres://mt_local_admin@127.0.0.1/maintrack_auth_local?host=remote.invalid','postgres://mt_local_admin@127.0.0.1/other_database'):
   with self.subTest(url=url),patch.object(sys,'argv',['finding_tests.py','login']),patch.dict('os.environ',{'LOGIN_PG_URL':url}),patch.object(finding_tests,'resolve_node',return_value='node'),patch.object(finding_tests,'execute_bounded') as execute,contextlib.redirect_stdout(io.StringIO()):
    self.assertEqual(finding_tests.main(),78);execute.assert_not_called()

if __name__=='__main__':unittest.main()
