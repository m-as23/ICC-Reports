"""Create owner-held signing backups, then optionally provision GitHub Secrets.

Run on the owner's computer, outside transient build runners. Never logs secrets.
Does not build, publish an APK, enable OTA, or replace an installed app.
"""
import argparse
import base64
import csv
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

REPO = 'm-as23/ICC-Reports'
ENVIRONMENT = 'maintrack-android-release'


def run(args, *, env=None, data=None):
    result = subprocess.run(args, input=data, capture_output=True, env=env)
    if result.returncode:
        # Tool diagnostics can contain user data; do not echo them.
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1])
    return result.stdout


def private_file(path, data):
    with open(path, 'xb') as handle:
        os.chmod(path, 0o600)
        handle.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir', required=True)
    parser.add_argument('--publish-secrets', action='store_true')
    args = parser.parse_args()
    backup = Path(args.backup_dir).expanduser().resolve()
    for parent in [backup, *backup.parents]:
        if (parent / '.git').exists():
            raise RuntimeError('Backup must be outside every Git repository')
    for tool in ['keytool', 'openssl'] + (['gh'] if args.publish_secrets else []):
        if not shutil.which(tool):
            raise RuntimeError('Required tool missing: ' + tool)
    if backup.exists():
        raise RuntimeError('Backup directory already exists; refusing to replace keys')
    if args.publish_secrets:
        run(['gh', 'auth', 'status'])
        # Require an existing environment; do not alter its protection rules.
        existing = json.loads(run(['gh', 'api',
            f'repos/{REPO}/environments/{ENVIRONMENT}/secrets']))
        if any(item['name'].startswith('MT_') for item in existing['secrets']):
            raise RuntimeError('Existing MainTrack secrets require review; refusing replacement')
        variable = json.loads(run(['gh', 'api', f'repos/{REPO}/actions/variables']))
        if any(item['name'] == 'MT_STAGE14_SIGNING_READY' for item in variable['variables']):
            raise RuntimeError('Existing signing readiness setting requires review')
    backup.mkdir(mode=0o700, parents=True)
    if os.name == 'nt':
        # chmod/umask do not restrict Windows ACLs. Protect the directory before
        # any key or recovery password is written; children inherit this ACL.
        identity = run(['whoami', '/user', '/fo', 'csv', '/nh']).decode().strip()
        sid = next(csv.reader([identity]))[-1]
        if not sid.startswith('S-1-'):
            raise RuntimeError('Could not determine Windows account SID')
        run(['icacls', str(backup), '/inheritance:r', '/grant:r',
             '*' + sid + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'])
    password = secrets.token_urlsafe(36)
    ota_password = secrets.token_urlsafe(36)
    env = dict(os.environ, MT_SETUP_PASSWORD=password, MT_SETUP_OTA_PASSWORD=ota_password)
    keystore = backup / 'maintrack-release.p12'
    # Restrict permissions at creation, including files created by subprocesses.
    previous_umask = os.umask(0o077)
    try:
        run(['keytool', '-genkeypair', '-noprompt', '-storetype', 'PKCS12',
            '-keystore', str(keystore), '-alias', 'maintrack-release',
            '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
            '-dname', 'CN=MainTrack Release', '-storepass:env', 'MT_SETUP_PASSWORD',
            '-keypass:env', 'MT_SETUP_PASSWORD'], env=env)
        certificate = run(['keytool', '-exportcert', '-keystore', str(keystore),
            '-alias', 'maintrack-release', '-storepass:env', 'MT_SETUP_PASSWORD'], env=env)
        run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-aes-256-cbc',
            '-pass', 'env:MT_SETUP_OTA_PASSWORD', '-out', str(backup / 'ota-private.pem')], env=env)
        public = run(['openssl', 'pkey', '-in', str(backup / 'ota-private.pem'),
            '-passin', 'env:MT_SETUP_OTA_PASSWORD', '-pubout', '-outform', 'DER'], env=env)
        config = {'schema': 1, 'certificateSha256': hashlib.sha256(certificate).hexdigest(),
                  'otaPublicKeyBase64': base64.urlsafe_b64encode(public[-32:]).decode().rstrip('='),
                  'repository': REPO, 'environment': ENVIRONMENT,
                  'rolloutEnabled': False, 'existingLabUpgradeCompatible': False}
        private_file(backup / 'public-signing.json', (json.dumps(config, indent=2) + '\n').encode())
        private_file(backup / 'recovery-passwords.json', (json.dumps({
            'keystorePassword': password, 'keyAlias': 'maintrack-release',
            'otaPrivateKeyPassword': ota_password}, indent=2) + '\n').encode())
        if args.publish_secrets:
            values = {'MT_ANDROID_KEYSTORE_BASE64': base64.b64encode(keystore.read_bytes()),
                      'MT_ANDROID_KEYSTORE_PASSWORD': password.encode(),
                      'MT_ANDROID_KEY_ALIAS': b'maintrack-release',
                      'MT_ANDROID_KEY_PASSWORD': password.encode(),
                      'MT_OTA_PRIVATE_KEY_PEM': (backup / 'ota-private.pem').read_bytes(),
                      'MT_OTA_PRIVATE_KEY_PASSWORD': ota_password.encode()}
            for name, value in values.items():
                run(['gh', 'secret', 'set', name, '--repo', REPO, '--env', ENVIRONMENT], data=value)
            run(['gh', 'variable', 'set', 'MT_ANDROID_EXPECTED_CERT_SHA256', '--repo', REPO,
                 '--env', ENVIRONMENT, '--body', config['certificateSha256']])
            # Leave readiness and last-installed version unset until owner acceptance.
        print('Signing backup created. Private values were not printed.')
        print('Backup directory: ' + str(backup))
        print('APK/OTA delivery remains disabled. Keep a separate protected backup copy.')
    finally:
        os.umask(previous_umask)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print('Setup stopped: ' + str(error), file=sys.stderr)
        print('Preserve any created backup; do not regenerate keys to retry.', file=sys.stderr)
        sys.exit(1)
