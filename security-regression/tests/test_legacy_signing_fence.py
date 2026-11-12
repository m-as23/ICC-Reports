import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('legacy_signing_fence', ROOT / 'security-regression/legacy_signing_fence.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LegacySigningFenceTests(unittest.TestCase):
    def test_current_operational_secret_jobs_are_retired(self):
        result = module.inspect_workflows(ROOT / '.github/workflows')
        self.assertEqual(result['unsafe'], [], result['unsafe'])
        self.assertGreaterEqual(len(result['fenced']), 15)

    def test_readonly_workflow_does_not_need_a_signing_fence(self):
        self.assertEqual(module.inspect_source('jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node --test\n')['unsafe'], [])

    def test_variable_or_step_gate_is_not_retirement(self):
        for condition in ['', "    if: vars.SIGNING_READY == 'true'\n", "    if: ${{ false || true }}\n"]:
            source = 'jobs:\n  sign:\n' + condition + '    steps:\n      - if: ${{ false }}\n        env:\n          KEY: ${{ secrets.SIGNING_KEY }}\n'
            self.assertTrue(module.inspect_source(source)['unsafe'])

    def test_literal_false_job_gate_blocks_dynamic_secret_selection(self):
        source = 'jobs:\n  sign:\n    if: ${{ false }}\n    steps:\n      - env:\n          KEY: ${{ secrets[inputs.key] }}\n'
        self.assertEqual(module.inspect_source(source)['unsafe'], [])
        self.assertEqual(module.inspect_source(source)['fenced'], ['sign'])

    def test_duplicate_if_and_workflow_secret_scope_are_rejected(self):
        self.assertTrue(module.inspect_source('env:\n  KEY: ${{ secrets.KEY }}\njobs:\n  test:\n    if: ${{ false }}\n')['unsafe'])
        self.assertTrue(module.inspect_source('jobs:\n  sign:\n    if: ${{ false }}\n    if: true\n    env:\n      KEY: ${{ secrets.KEY }}\n')['unsafe'])

    def test_inherited_secrets_require_fence(self):
        self.assertTrue(module.inspect_source('jobs:\n  sign:\n    uses: org/repo/.github/workflows/sign.yml@main\n    secrets: inherit\n')['unsafe'])


if __name__ == '__main__':
    unittest.main()
