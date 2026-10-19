import importlib.util
import pathlib
import unittest
import tempfile

MODULE = pathlib.Path(__file__).resolve().parents[1] / "scripts/verify-native-405-build.py"
spec = importlib.util.spec_from_file_location("verify_native_405_build", MODULE)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

CERT_LINE = "Signer #1 certificate SHA-256 digest: " + checker.CERT
BADGING = ("package: name='com.icc.maintrack' versionCode='405' "
           "versionName='0.4.5'\n")

class TestNative045Verification(unittest.TestCase):
    def test_valid_signed_upgrade_identity(self):
        result = checker.parse_apk_identity(CERT_LINE, BADGING)
        self.assertEqual(result["versionCode"], 405)
        self.assertEqual(result["certificateSha256"], checker.CERT)
        self.assertEqual(result["appId"], "com.icc.maintrack")

    def test_reject_installed_404_repackaging(self):
        with self.assertRaisesRegex(ValueError, "APK_VERSION_CODE_NOT_405"):
            checker.parse_apk_identity(CERT_LINE,
                                       BADGING.replace("versionCode='405'", "versionCode='404'"))

    def test_reject_older_401_apk(self):
        with self.assertRaisesRegex(ValueError, "APK_VERSION_CODE_NOT_405"):
            checker.parse_apk_identity(CERT_LINE,
                                       BADGING.replace("versionCode='405'", "versionCode='401'"))

    def test_reject_different_android_app_id(self):
        with self.assertRaisesRegex(ValueError, "APK_APP_ID_CHANGED"):
            checker.parse_apk_identity(CERT_LINE, BADGING.replace("com.icc.maintrack", "com.fake"))

    def test_reject_different_signer_certificate(self):
        with self.assertRaisesRegex(ValueError, "APK_CERT_INCOMPATIBLE"):
            checker.parse_apk_identity(
                CERT_LINE.replace(checker.CERT, "0" * 64), BADGING)

    def test_reject_missing_signer_certificate(self):
        with self.assertRaisesRegex(ValueError, "APK_SIGNING_CERT_UNREADABLE"):
            checker.parse_apk_identity("No certificate", BADGING)

    def test_reject_invalid_version_name(self):
        with self.assertRaisesRegex(ValueError, "APK_VERSION_NAME_NOT_045"):
            checker.parse_apk_identity(CERT_LINE,
                                       BADGING.replace("versionName='0.4.5'", "versionName='0.4.4'"))

    def test_reject_missing_package_badging(self):
        with self.assertRaisesRegex(ValueError, "APK_AAPT_IDENTITY_UNREADABLE"):
            checker.parse_apk_identity(CERT_LINE, "package: missing")

    def test_capacitor_generated_runtime_is_allowed_but_reviewed_js_is_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "index.html").write_text("<html>MainTrack</html>")
            (dst / "index.html").write_text("<html>MainTrack</html>")
            (dst / "capacitor.js").write_text("// Capacitor runtime")
            (dst / "capacitor.plugins.js").write_text("// Capacitor plugin bootstrap")
            result = checker.verify_synced_asset_tree(src, dst)
            self.assertEqual(result["reviewedFiles"], 1)
            self.assertEqual(result["capacitorRuntime"],
                             ["capacitor.js", "capacitor.plugins.js"])

    def test_empty_optional_cordova_plugin_list_is_expected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "index.html").write_text("<html>MainTrack</html>")
            (dst / "index.html").write_text("<html>MainTrack</html>")
            (dst / "cordova_plugins.js").write_bytes(b"")
            (dst / "cordova.js").write_bytes(b"")
            (dst / "capacitor.plugins.js").write_bytes(b"")
            verified = checker.verify_synced_asset_tree(src, dst)
            self.assertEqual(verified["reviewedFiles"], 1)

    def test_core_capacitor_runtime_must_not_be_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "index.html").write_text("<html>MainTrack</html>")
            (dst / "index.html").write_text("<html>MainTrack</html>")
            (dst / "capacitor.js").write_bytes(b"")
            with self.assertRaisesRegex(ValueError, "CAPACITOR_GENERATED_RUNTIME_SIZE_INVALID"):
                checker.verify_synced_asset_tree(src, dst)

    def test_capacitor_must_not_modify_reviewed_web_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "index.html").write_text("<html>original</html>")
            (dst / "index.html").write_text("<html>tampered</html>")
            with self.assertRaisesRegex(ValueError, "CAPACITOR_SYNC_BYTES_DIFFER"):
                checker.verify_synced_asset_tree(src, dst)

    def test_capacitor_rejects_unapproved_generated_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "index.html").write_text("<html>ok</html>")
            (dst / "index.html").write_text("<html>ok</html>")
            (dst / "malicious-overrides.js").write_text("// not permitted")
            with self.assertRaisesRegex(ValueError, "CAPACITOR_UNREVIEWED_EXTRA_ASSETS"):
                checker.verify_synced_asset_tree(src, dst)

    def test_capacitor_rejects_missing_reviewed_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp) / "reviewed"
            dst = pathlib.Path(tmp) / "android"
            src.mkdir()
            dst.mkdir()
            (src / "stage20-native-session.js").write_text("// secret safe bridge")
            with self.assertRaisesRegex(ValueError, "CAPACITOR_MISSING_REVIEWED_ASSETS"):
                checker.verify_synced_asset_tree(src, dst)

    def test_production_employee_release_remains_blocked(self):
        policy = pathlib.Path(__file__).resolve().parents[1] / "employee-release-gates.json"
        import json
        gates = json.loads(policy.read_text())
        self.assertEqual(gates["state"], "PRELAUNCH_BLOCKED")
        self.assertFalse(gates["approvedArchitecture"]["employeeAndroidApkReleaseAllowed"])
        self.assertFalse(gates["approvedArchitecture"]["productionWebDeploymentAllowed"])

if __name__ == "__main__":
    unittest.main()
