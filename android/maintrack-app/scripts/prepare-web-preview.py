"""Prepare a static Vercel preview from a verified candidate; never deploy it.

Network access from the preview is restricted to its own origin. This is an
isolated UI/distribution review, not a live-backend acceptance environment.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('candidate', ROOT / 'scripts/release-candidate.py')
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)


def prepare(source, destination, expected_commit):
    manifest = candidate.verify(source)
    if manifest['sourceCommit'] != expected_commit:
        raise ValueError('CANDIDATE_COMMIT_MISMATCH')
    # Never merge new output into stale, partially prepared deployment files.
    if destination.exists():
        raise ValueError('OUTPUT_ALREADY_EXISTS')
    base = manifest['webBasePath']
    prefix = base.lstrip('/')
    output = destination / '.vercel/output'
    static = output / 'static'
    with zipfile.ZipFile(source / 'maintrack-web.zip') as archive:
        for name in archive.namelist():
            path = static / prefix / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.read(name))
    # A response-header CSP intersects with the locked HTML policy; no source edits.
    headers = {'Content-Security-Policy': "connect-src 'self'; form-action 'none'; frame-ancestors 'none'",
               'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
               'Referrer-Policy': 'no-referrer'}
    routes = [
        {'src': '/(.*)', 'headers': headers, 'continue': True},
        {'src': '/', 'status': 307,
         'headers': {'Location': base, 'Cache-Control': 'no-store'}},
        {'src': base + '(.*)', 'headers': {'Cache-Control': 'public, max-age=31536000, immutable'},
         'continue': True},
        {'src': '/review.json', 'headers': {'Cache-Control': 'no-store'}, 'continue': True},
        {'handle': 'filesystem'},
        {'src': '/(.*)', 'status': 404}
    ]
    (output / 'config.json').write_text(json.dumps({'version': 3, 'routes': routes}, indent=2) + '\n')
    review = {'schema': 1, 'sourceCommit': expected_commit, 'appId': manifest['appId'],
              'mode': 'isolated-preview', 'rolloutEnabled': False, 'liveBackendEnabled': False,
              'webBasePath': base, 'archiveSha256': manifest['archives']['maintrack-web.zip']['sha256']}
    (static / 'review.json').write_text(json.dumps(review, indent=2) + '\n')
    # Export one artifact ZIP including hidden .vercel paths (upload-artifact ignores
    # hidden directories by default). No project binding or credentials are included.
    with zipfile.ZipFile(destination / 'maintrack-web-preview.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(destination).as_posix())
    print('PASS isolated static preview: exact candidate bytes, versioned path, backend blocked; not deployed')
    return review


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', type=Path, default=ROOT / 'release-candidate')
    parser.add_argument('--output', type=Path, default=ROOT / 'web-preview')
    parser.add_argument('--expected-commit', required=True)
    args = parser.parse_args()
    prepare(args.candidate.resolve(), args.output.resolve(), args.expected_commit)
