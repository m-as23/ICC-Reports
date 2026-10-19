import importlib.util
import pathlib
import unittest

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

    def test_production_employee_release_remains_blocked(self):
        policy = pathlib.Path(__file__).resolve().parents[1] / "employee-release-gates.json"
        import json
        gates = json.loads(policy.read_text())
        self.assertEqual(gates["state"], "PRELAUNCH_BLOCKED")
        self.assertFalse(gates["approvedArchitecture"]["employeeAndroidApkReleaseAllowed"])
        self.assertFalse(gates["approvedArchitecture"]["productionWebDeploymentAllowed"])

if __name__ == "__main__":
    unittest.main()
