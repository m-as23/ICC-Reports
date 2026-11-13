"""Collector regression: real workflow runs have no completed_at field."""
import base64
import copy
import hashlib
import io
import json
import pathlib
import sys
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import single_owner_approval as owner
import test_single_owner as fixtures


class BuildTimeCollectorTests(unittest.TestCase):
    def setUp(self):
        f = fixtures.SingleOwnerTests()
        f.setUp()
        self.fixture = f
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as z:
            z.writestr('candidate.apk', b'unsigned-fixture')
        self.archive = raw.getvalue()
        self.digest = hashlib.sha256(b'unsigned-fixture').hexdigest()
        f.subject['artifactSha256'] = self.digest
        f.comment['body'] = json.dumps({'kind': 'maintrack-owner-artifact-signoff-v1', **f.subject})
        f.reviews[0]['comment'] = json.dumps({'kind': 'maintrack-owner-environment-approval-v1', 'ownerCommentId': 5, 'bodySha256': hashlib.sha256(f.comment['body'].encode()).hexdigest()})
        workflow = b'reviewed-workflow'
        self.pin = hashlib.sha256(workflow).hexdigest()
        self.path = '.github/workflows/fixture.yml'
        build = {k: v for k, v in f.build.items() if k != 'completed_at'}
        build['path'] = self.path
        self.jobs_route = 'actions/runs/3/attempts/1/jobs?per_page=100'
        job = {'run_id': 3, 'run_attempt': 1, 'status': 'completed', 'conclusion': 'success', 'completed_at': '2026-11-01T01:00:00Z'}
        self.replies = {
            'actions/runs/3': build,
            'actions/runs/4': {**f.run, 'path': self.path},
            'contents/' + self.path + '?ref=' + 'a' * 40: {'type': 'file', 'encoding': 'base64', 'size': len(workflow), 'content': base64.b64encode(workflow).decode()},
            'actions/artifacts/2': {'expired': False, 'workflow_run': {'id': 3, 'head_sha': 'a' * 40}, 'digest': 'sha256:' + hashlib.sha256(self.archive).hexdigest()},
            self.jobs_route: {'total_count': 2, 'jobs': [{**job, 'completed_at': '2026-11-01T00:59:00Z'}, job]},
            'actions/runs/4/jobs?per_page=100': {'jobs': [f.job]},
            'environments/' + owner.ENV: f.env,
            'actions/runs/4/approvals': f.reviews,
            'issues/comments/5': f.comment,
        }

    def collect(self):
        with patch.object(owner, 'api', side_effect=lambda p: copy.deepcopy(self.replies[p])), patch.object(owner.subprocess, 'check_output', return_value=self.archive):
            return owner.fetch_owner_approval(3, 4, 2, 5, 'a' * 40, self.digest, 'candidate.apk', 'c' * 64, workflow_path=self.path, workflow_sha256=self.pin, build_workflow_path=self.path, build_workflow_sha256=self.pin)

    def test_real_api_shape_uses_latest_completed_build_job(self):
        proof = self.collect()
        self.assertTrue(proof['approved'])
        self.assertFalse(proof['independentReview'])
        self.assertFalse(proof['signingAuthorized'])

    def test_incomplete_wrong_attempt_and_invalid_job_times_fail_closed(self):
        original = copy.deepcopy(self.replies[self.jobs_route])
        changes = [
            {'total_count': 3},
            {'jobs': []},
            {'jobs': [{**original['jobs'][1], 'completed_at': None}]},
            {'jobs': [{**original['jobs'][1], 'completed_at': '2026-11-01T01:00:00'}]},
            {'jobs': [{**original['jobs'][1], 'run_id': 9}]},
            {'jobs': [{**original['jobs'][1], 'run_attempt': 2}]},
            {'jobs': [{**original['jobs'][1], 'status': 'in_progress'}]},
        ]
        for change in changes:
            with self.subTest(change=change):
                self.replies[self.jobs_route] = {**copy.deepcopy(original), **change}
                if 'jobs' in change:
                    self.replies[self.jobs_route]['total_count'] = len(change['jobs'])
                with self.assertRaisesRegex(ValueError, 'BUILD_JOB_TIMES_REQUIRED'):
                    self.collect()
        self.replies[self.jobs_route] = original

    def test_owner_signoff_before_last_build_job_is_rejected(self):
        self.replies[self.jobs_route]['jobs'][1]['completed_at'] = '2026-11-01T01:01:30Z'
        with self.assertRaisesRegex(ValueError, 'OWNER_REVIEW_ORDER_INVALID'):
            self.collect()


if __name__ == '__main__':
    unittest.main()
