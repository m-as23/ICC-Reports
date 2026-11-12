"""Regression for host-dependent ZIP creator metadata."""

import importlib.util
from io import BytesIO
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo


spec = importlib.util.spec_from_file_location(
    "verify_release_candidate", Path(__file__).resolve().parents[1] / "verify.py"
)
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class ArchiveCreatorTest(unittest.TestCase):
    def test_windows_and_linux_defaults_produce_the_pinned_archives(self):
        expected = json.loads((verify.ROOT / "inputs.json").read_bytes())

        def entry_with_host_default(name):
            entry = ZipInfo(name)
            entry.create_system = host_default
            return entry

        for kind, digest in expected.items():
            builds = []
            for host_default in (0, 3):
                with self.subTest(kind=kind, host_default=host_default):
                    with patch.object(verify, "ZipInfo", entry_with_host_default):
                        data = verify.build(kind, digest)
                    with ZipFile(BytesIO(data)) as archive:
                        self.assertTrue(all(entry.create_system == 0 for entry in archive.infolist()))
                    builds.append(data)
            self.assertEqual(len(builds), 2)
            self.assertEqual(builds[0], builds[1])
