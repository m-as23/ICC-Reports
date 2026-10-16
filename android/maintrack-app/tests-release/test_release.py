"""Short release preparation checks. No emulator, backend, or permanent keys."""
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


signing = load('release-preflight')
preview = load('prepare-web-preview')
SHA = 'a' * 40


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'capacitor.config.json').read_text())
        self.env = {**os.environ, 'GITHUB_SHA': SHA, 'GITHUB_REF': signing.BRANCH,
                    'MT_STAGE14_SIGNING_READY': 'true', 'EXPECTED_CERT_SHA256': 'a' * 64,
                    'LAST_VERSION_CODE': '14', 'VERSION_CODE': '15', 'VERSION_NAME': '0.3.1',
                    **{name: 'TEST_ONLY' for name in signing.SECRETS}}

    def test_valid_settings_disable_rollout(self):
        report = signing.settings(self.env, self.config, SHA)
        self.assertFalse(report['rolloutEnabled'])
        self.assertEqual(report['versionCode'], 15)

    def test_missing_secrets_do_not_expose_values(self):
        for key in signing.SECRETS:
            with self.subTest(key=key):
                env = {**self.env, key: ''}
                with self.assertRaises(signing.PreflightError) as error:
                    signing.settings(env, self.config, SHA)
                self.assertIn(key, str(error.exception))
                self.assertNotIn('TEST_ONLY', str(error.exception))

    def test_rejects_wrong_commit_branch_versions_and_certificate(self):
        for name, value in [('GITHUB_SHA', 'b' * 40), ('GITHUB_REF', 'refs/heads/main'),
                            ('MT_STAGE14_SIGNING_READY', 'false'), ('VERSION_CODE', '14'),
                            ('VERSION_CODE', '13'), ('VERSION_CODE', '1.5'),
                            ('VERSION_CODE', '2000000001'), ('LAST_VERSION_CODE', ''),
                            ('EXPECTED_CERT_SHA256', ''), ('VERSION_NAME', '0.3.0"')]:
            with self.subTest(name=name, value=value), self.assertRaises(signing.PreflightError):
                signing.settings({**self.env, name: value}, self.config, SHA)

    def test_rejects_app_origin_or_updater_changes(self):
        for change in ('app', 'origin', 'auto', 'endpoint', 'delete'):
            config = copy.deepcopy(self.config)
            updater = config['plugins']['CapacitorUpdater']
            if change == 'app': config['appId'] = 'com.other.app'
            if change == 'origin': config['server']['hostname'] = 'other'
            if change == 'auto': updater['autoUpdate'] = 'on'
            if change == 'endpoint': updater['updateUrl'] = 'https://example.invalid'
            if change == 'delete': updater['autoDeletePrevious'] = True
            with self.subTest(change=change), self.assertRaises(signing.PreflightError):
                signing.settings(self.env, config, SHA)

    def test_real_disposable_private_key_and_bad_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / 'disposable.jks'
            env = {**self.env, 'MT_ANDROID_KEYSTORE_PASSWORD': secrets.token_hex(16),
                   'MT_ANDROID_KEY_PASSWORD': secrets.token_hex(16), 'MT_ANDROID_KEY_ALIAS': 'qa-only'}
            command = ['keytool', '-genkeypair', '-keystore', str(key), '-storetype', 'JKS',
                       '-alias', 'qa-only', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1',
                       '-dname', 'CN=Disposable MainTrack Test',
                       '-storepass:env', 'MT_ANDROID_KEYSTORE_PASSWORD',
                       '-keypass:env', 'MT_ANDROID_KEY_PASSWORD', '-noprompt']
            subprocess.run(command, env=env, check=True, capture_output=True, timeout=30)
            certificate = subprocess.check_output(['keytool', '-exportcert', '-keystore', str(key),
                           '-alias', 'qa-only', '-storepass:env', 'MT_ANDROID_KEYSTORE_PASSWORD'],
                           env=env, stderr=subprocess.DEVNULL, timeout=30)
            fingerprint = hashlib.sha256(certificate).hexdigest()
            env['MT_ANDROID_KEYSTORE_BASE64'] = base64.b64encode(key.read_bytes()).decode()
            signing.verify_keystore(env, fingerprint)
            for update, expected_error in [
                    ({'MT_ANDROID_KEY_PASSWORD': 'wrong-test-password'}, 'PRIVATE_KEY_OR_PASSWORD_UNUSABLE'),
                    ({'MT_ANDROID_KEYSTORE_PASSWORD': 'wrong-test-password'}, 'KEYSTORE_CERTIFICATE_UNREADABLE'),
                    ({'MT_ANDROID_KEY_ALIAS': 'missing'}, 'KEYSTORE_CERTIFICATE_UNREADABLE'),
                    ({'MT_ANDROID_KEYSTORE_BASE64': '!!!'}, 'INVALID_KEYSTORE_ENCODING')]:
                with self.subTest(expected_error=expected_error), self.assertRaisesRegex(signing.PreflightError, expected_error):
                    signing.verify_keystore({**env, **update}, fingerprint)
            with self.assertRaisesRegex(signing.PreflightError, 'SIGNING_CERTIFICATE_MISMATCH'):
                signing.verify_keystore(env, '0' * 64)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'candidate'
        self.source.mkdir()
        files = {'index.html': b'<html><body>Isolated fixture</body></html>', 'app.js': b'/* fixture */'}
        manifest = {'schema': 1, 'appId': 'com.icc.maintrack', 'sourceCommit': SHA,
                    'localData': preview.candidate.CONTRACT, 'rolloutEnabled': False,
                    'signed': False, 'mode': 'review-only', 'webBasePath': '/releases/' + SHA + '/',
                    'files': {k: {'sha256': hashlib.sha256(v).hexdigest(), 'bytes': len(v)} for k, v in files.items()},
                    'archives': {}}
        for name in ('maintrack-web.zip', 'maintrack-ota-unsigned.zip'):
            path = self.source / name
            with zipfile.ZipFile(path, 'w') as archive:
                for filename, data in files.items(): archive.writestr(filename, data)
            manifest['archives'][name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}
        (self.source / 'candidate.json').write_text(json.dumps(manifest))

    def test_preview_preserves_bytes_and_enforces_isolation(self):
        destination = self.root / 'preview'
        report = preview.prepare(self.source, destination, SHA)
        output = destination / '.vercel/output'
        config = json.loads((output / 'config.json').read_text())
        self.assertEqual(config['version'], 3)
        self.assertIn("connect-src 'self'", config['routes'][0]['headers']['Content-Security-Policy'])
        self.assertEqual(config['routes'][1]['headers']['Cache-Control'], 'no-store')
        self.assertEqual(config['routes'][1]['headers']['Location'], '/releases/' + SHA + '/')
        self.assertIn('immutable', config['routes'][2]['headers']['Cache-Control'])
        self.assertEqual(config['routes'][-1]['status'], 404)
        with zipfile.ZipFile(self.source / 'maintrack-web.zip') as archive:
            for name in archive.namelist():
                self.assertEqual((output / 'static' / report['webBasePath'].lstrip('/') / name).read_bytes(), archive.read(name))
        with zipfile.ZipFile(destination / 'maintrack-web-preview.zip') as archive:
            self.assertIn('.vercel/output/config.json', archive.namelist())
            self.assertNotIn('.vercel/project.json', archive.namelist())
        self.assertFalse(report['liveBackendEnabled'])

    def test_rejects_commit_mismatch_without_writing_output(self):
        with self.assertRaisesRegex(ValueError, 'CANDIDATE_COMMIT_MISMATCH'):
            preview.prepare(self.source, self.root / 'preview', 'b' * 40)
        self.assertFalse((self.root / 'preview').exists())

    def test_rejects_overwrite(self):
        destination = self.root / 'preview'
        destination.mkdir()
        sentinel = destination / 'retain.txt'
        sentinel.write_text('keep')
        with self.assertRaisesRegex(ValueError, 'OUTPUT_ALREADY_EXISTS'):
            preview.prepare(self.source, destination, SHA)
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_rejects_corrupt_archive_before_output(self):
        with (self.source / 'maintrack-web.zip').open('ab') as archive:
            archive.write(b'tamper')
        with self.assertRaises(AssertionError):
            preview.prepare(self.source, self.root / 'preview', SHA)
        self.assertFalse((self.root / 'preview').exists())


if __name__ == '__main__':
    unittest.main()
