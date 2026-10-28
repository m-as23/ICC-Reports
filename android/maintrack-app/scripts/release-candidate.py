"""Build/verify reviewable, unsigned Web + OTA candidates. Never deploy or sign."""
import argparse, hashlib, json, pathlib, subprocess, zipfile, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
CONTRACT = {'reportQueue': 1, 'writesReportQueue': 1, 'migration': 'none'}
def digest(data):
    return hashlib.sha256(data).hexdigest()
def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO, text=True).strip()
def check_manifest(manifest):
    assert manifest['schema'] == 1 and manifest['appId'] == 'com.icc.maintrack'
    assert manifest['localData'] == CONTRACT
    assert manifest['rolloutEnabled'] is False and manifest['signed'] is False
    assert manifest['mode'] == 'review-only'
    assert len(manifest['sourceCommit']) == 40 and all(c in '0123456789abcdef' for c in manifest['sourceCommit'])
    assert manifest['webBasePath'] == '/releases/' + manifest['sourceCommit'] + '/'
    assert set(manifest['archives']) == {'maintrack-web.zip', 'maintrack-ota-unsigned.zip'}
def verify(output):
    manifest = json.loads((output/'candidate.json').read_text())
    check_manifest(manifest)
    for name, expected in manifest['archives'].items():
        data = (output/name).read_bytes()
        assert digest(data) == expected['sha256'] and len(data) == expected['bytes'], 'archive integrity'
        with zipfile.ZipFile(output/name) as z:
            names = z.namelist()
            assert len(names) == len(set(names)) and set(names) == set(manifest['files']), 'archive members'
            for entry in names:
                assert not entry.startswith('/') and '..' not in pathlib.PurePosixPath(entry).parts
                info = z.getinfo(entry)
                assert info.file_size == manifest['files'][entry]['bytes']
                assert digest(z.read(entry)) == manifest['files'][entry]['sha256'], 'resource integrity'
    print('PASS candidate archives: exact members and bytes; unsigned, rollout disabled')
    return manifest

def build(output):
    branch_ok = git('branch','--show-current') == 'android/stage14-ota-native-lab'
    pinned_ci = os.environ.get('GITHUB_REF') == 'refs/heads/android/stage14-ota-native-lab' and os.environ.get('GITHUB_SHA') == git('rev-parse','HEAD')
    assert branch_ok or pinned_ci, 'isolated branch or its exact CI commit required'
    assert not git('diff','HEAD','--name-only'), 'commit tracked changes before packaging'
    # Always rebuild from the locked source. Never package a previously modified QA www.
    subprocess.run(['node','scripts/snapshot.mjs'], cwd=ROOT, check=True)
    snapshot = json.loads((ROOT/'snapshot.lock.json').read_text())
    expected = {a['path'] for a in snapshot['assets']} | {'secure-assets/stage13-native-ready.js','secure-assets/stage14-local-work.js','secure-assets/account-v2.js','secure-assets/account-v2.css'}
    files = {p.relative_to(ROOT/'www').as_posix():p for p in (ROOT/'www').rglob('*') if p.is_file()}
    assert set(files) == expected, 'unexpected or missing resource: no QA harness allowed'
    assert not any(p.is_symlink() for p in files.values()), 'symlink source'
    manifest = {'schema':1,'appId':'com.icc.maintrack','mode':'review-only','signed':False,'rolloutEnabled':False,
        'sourceCommit':git('rev-parse','HEAD'),'localData':CONTRACT,
        'files':{name:{'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size} for name,p in sorted(files.items())},'archives':{}}
    manifest['webBasePath'] = '/releases/' + manifest['sourceCommit'] + '/'
    output.mkdir(parents=True, exist_ok=True)
    for name in ['maintrack-web.zip','maintrack-ota-unsigned.zip']:
        with zipfile.ZipFile(output/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for entry,p in sorted(files.items()):
                info = zipfile.ZipInfo(entry,(2026,1,1,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info,p.read_bytes())
        data = (output/name).read_bytes()
        manifest['archives'][name] = {'sha256':digest(data),'bytes':len(data)}
    (output/'candidate.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (output/'SHA256SUMS').write_text(''.join(digest(p.read_bytes())+'  '+p.name+'\n' for p in sorted(output.iterdir()) if p.name in [*manifest['archives'],'candidate.json']))
    verify(output)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command',choices=['build','verify'])
    parser.add_argument('--output',type=pathlib.Path,default=ROOT/'release-candidate')
    args = parser.parse_args()
    (build if args.command == 'build' else verify)(args.output.resolve())
