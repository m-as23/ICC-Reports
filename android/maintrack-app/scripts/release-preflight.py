"""Fail before an Android build if owner signing inputs are missing or inconsistent.

Never create a permanent key, print secret values, or enable rollout.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BRANCH = 'refs/heads/android/stage14-ota-native-lab'
SECRETS = ('MT_ANDROID_KEYSTORE_BASE64', 'MT_ANDROID_KEYSTORE_PASSWORD',
           'MT_ANDROID_KEY_ALIAS', 'MT_ANDROID_KEY_PASSWORD')


class PreflightError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise PreflightError(reason)


def settings(env, config, head):
    require(env.get('GITHUB_REF') == BRANCH, 'ISOLATED_BRANCH_REQUIRED')
    require(re.fullmatch('[0-9a-f]{40}', head) and env.get('GITHUB_SHA') == head,
            'EXACT_EVENT_COMMIT_REQUIRED')
    require(env.get('MT_STAGE14_SIGNING_READY') == 'true', 'OWNER_SIGNING_NOT_ENABLED')
    require(config.get('appId') == 'com.icc.maintrack', 'APP_ID_CHANGED')
    require(config.get('server') == {'hostname': 'localhost', 'androidScheme': 'https'},
            'LOCAL_ORIGIN_CHANGED')
    updater = config.get('plugins', {}).get('CapacitorUpdater', {})
    require(updater.get('autoUpdate') == 'off' and
            updater.get('autoDeletePrevious') is False and
            not any(updater.get(k) for k in ('updateUrl', 'channelUrl', 'statsUrl')),
            'UNAPPROVED_UPDATE_CONFIGURATION')
    missing = [key for key in SECRETS if not env.get(key)]
    require(not missing, 'MISSING_SIGNING_SECRETS: ' + ', '.join(missing))
    cert = env.get('EXPECTED_CERT_SHA256', '').replace(':', '').lower()
    require(re.fullmatch('[0-9a-f]{64}', cert), 'APPROVED_CERTIFICATE_REQUIRED')
    last, code = env.get('LAST_VERSION_CODE', ''), env.get('VERSION_CODE', '')
    require(re.fullmatch('[0-9]{1,10}', last) and re.fullmatch('[0-9]{1,10}', code),
            'INTEGER_VERSION_CODES_REQUIRED')
    require(0 <= int(last) < int(code) <= 2000000000, 'VERSION_CODE_MUST_INCREASE')
    version = env.get('VERSION_NAME', '')
    require(re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version),
            'INVALID_VERSION_NAME')
    return {'schema': 1, 'appId': config['appId'], 'sourceCommit': head,
            'versionCode': int(code), 'versionName': version,
            'certificateSha256': cert, 'rolloutEnabled': False}


def verify_keystore(env, expected):
    # Keytool diagnostics may contain user-provided data. Never forward them.
    try:
        encoded = ''.join(env['MT_ANDROID_KEYSTORE_BASE64'].split())
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, KeyError):
        raise PreflightError('INVALID_KEYSTORE_ENCODING') from None
    require(0 < len(raw) <= 1024 * 1024, 'INVALID_KEYSTORE_SIZE')
    with tempfile.TemporaryDirectory(prefix='maintrack-signing-') as directory:
        path = Path(directory) / 'release.keystore'
        path.write_bytes(raw)
        path.chmod(0o600)
        common = ['-keystore', str(path), '-alias', env['MT_ANDROID_KEY_ALIAS'],
                  '-storepass:env', 'MT_ANDROID_KEYSTORE_PASSWORD']
        for action in ('-exportcert', '-certreq'):
            command = ['keytool', action, *common]
            if action == '-certreq':
                command += ['-keypass:env', 'MT_ANDROID_KEY_PASSWORD']
            try:
                result = subprocess.run(command, env=dict(env), input=b'',
                                        capture_output=True, timeout=30)
            except (OSError, subprocess.TimeoutExpired):
                raise PreflightError('KEYTOOL_UNAVAILABLE_OR_TIMED_OUT') from None
            require(result.returncode == 0,
                    'KEYSTORE_CERTIFICATE_UNREADABLE' if action == '-exportcert'
                    else 'PRIVATE_KEY_OR_PASSWORD_UNUSABLE')
            if action == '-exportcert':
                require(hashlib.sha256(result.stdout).hexdigest() == expected,
                        'SIGNING_CERTIFICATE_MISMATCH')


def main():
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    config = json.loads((ROOT / 'capacitor.config.json').read_text())
    report = settings(os.environ, config, head)
    verify_keystore(os.environ, report['certificateSha256'])
    output = ROOT / 'release-output'
    output.mkdir(exist_ok=True)
    (output / 'signing-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PASS owner signing inputs, private key, certificate, app identity and increasing version; rollout disabled')


if __name__ == '__main__':
    try:
        main()
    except PreflightError as error:
        print('BLOCKED: ' + str(error))
        raise SystemExit(1)
