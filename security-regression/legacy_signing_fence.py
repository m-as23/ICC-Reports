"""Conservative source check, not GitHub enforcement or release authorization.

Legacy secret-capable jobs must be unconditionally retired. A future reviewed
signing workflow needs a separate explicit policy, never an automatic exception.
Unsupported YAML shapes containing secrets fail closed instead of being guessed.
"""
import json
import re
from pathlib import Path

SECRET = re.compile(r'\bsecrets\s*(?:\.|\[|:)|\btoJSON\s*\(\s*secrets\s*\)', re.I)
JOB = re.compile(r'^  ([A-Za-z0-9_-]+):\s*$')
DISABLED = '    if: ${{ false }}'


def inspect_source(source):
    unsafe, fenced = [], []
    lines = source.splitlines()
    jobs_index = next((i for i, line in enumerate(lines) if line == 'jobs:'), None)
    if jobs_index is None:
        return {'unsafe': ['unsupported-secret-layout'] if SECRET.search(source) else [], 'fenced': []}
    if SECRET.search('\n'.join(lines[:jobs_index])):
        unsafe.append('workflow-level-secret-reference')
    blocks, current = [], None
    for line in lines[jobs_index + 1:]:
        match = JOB.fullmatch(line)
        if match:
            current = [match[1], []]
            blocks.append(current)
        elif current is not None:
            current[1].append(line)
        elif SECRET.search(line):
            unsafe.append('unsupported-job-layout')
    for name, body in blocks:
        if not SECRET.search('\n'.join(body)):
            continue
        conditions = [line for line in body if re.match(r'^    if:', line)]
        if conditions == [DISABLED]:
            index = body.index(DISABLED)
            following = next((s for s in body[index + 1:] if s.strip() and not s.lstrip().startswith('#')), '')
            # Reject folded expression continuations or nested aliases after if.
            if following and (following.startswith('     ') or not following.startswith('    ')):
                unsafe.append(name)
            else:
                fenced.append(name)
        else:
            unsafe.append(name)
    return {'unsafe': unsafe, 'fenced': fenced}


def inspect_workflows(directory):
    unsafe, fenced = [], []
    for path in sorted(Path(directory).iterdir()):
        if path.suffix not in ('.yml', '.yaml'):
            continue
        result = inspect_source(path.read_text(encoding='utf-8-sig'))
        unsafe.extend(f'{path.name}:{job}' for job in result['unsafe'])
        fenced.extend(f'{path.name}:{job}' for job in result['fenced'])
    return {'unsafe': unsafe, 'fenced': fenced, 'platformEnforcement': 'NOT PROVEN', 'releaseAuthorized': False}


if __name__ == '__main__':
    result = inspect_workflows(Path(__file__).resolve().parents[1] / '.github/workflows')
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result['unsafe'] else 0)
