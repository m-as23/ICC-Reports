#!/usr/bin/env python3
"""Owner QA native 0.4.5 / 405: fail-closed source, Android and signed APK checks.

Checks are read-only apart from the explicit --signed provenance JSON output.
Never retrieves or prints signing keys. Does not publish a release.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "android/maintrack-app"
CANDIDATE = ROOT / "audit-output/native-405-qa"
CERT = "07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b"
APP_ID = "com.icc.maintrack"
CODE = 405
NAME = "0.4.5"
NEW_API = "maintrack-unified-four-qa/api"
OLD_API = "maintrack-stage9-security-api/api"


def require(condition, reason):
    if not condition:
        raise ValueError("BLOCKED: " + reason)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def enumerate_regular_files(root):
    require(root.is_dir(), "CANDIDATE_DIRECTORY_MISSING")
    found = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            item = Path(directory) / name
            require(not item.is_symlink(), "CANDIDATE_SYMLINK")
        for name in files:
            file = Path(directory) / name
            require(file.is_file(), "CANDIDATE_NON_FILE")
            rel = file.relative_to(root).as_posix()
            require(rel and ".." not in Path(rel).parts, "UNSAFE_CANDIDATE_PATH")
            require(rel not in found, "DUPLICATE_CANDIDATE_PATH")
            found.add(rel)
    return found


def verify_candidate(candidate=CANDIDATE, root=ROOT):
    record = json.loads((candidate / "provenance.json").read_text())
    require(record.get("schema") == 1, "CANDIDATE_SCHEMA")
    require(record.get("mode") == "OWNER_QA_SOURCE_NOT_SIGNED_NOT_PUBLISHED", "UNAPPROVED_CANDIDATE_MODE")
    require(record.get("appId") == APP_ID, "CANDIDATE_PACKAGE")
    require(record.get("proposedNativeVersionCode") == CODE, "CANDIDATE_VERSION_CODE")
    require(record.get("proposedVersionName") == NAME, "CANDIDATE_VERSION_NAME")
    require(record.get("backend") == "maintrack-unified-four-qa" and
            record.get("apiActionContract") == 32, "CANDIDATE_API_CONTRACT")
    require(record.get("rollout") is False and record.get("employeeRelease") is False,
            "CANDIDATE_ROLLOUT_FORBIDDEN")
    require(record.get("nativeSessionBridge") is True and record.get("offlineWorkBridge") is True,
            "CANDIDATE_SESSION_OFFLINE_BRIDGES_REQUIRED")
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    require(re.fullmatch("[0-9a-f]{40}", sha) and
            record.get("sourceCommit") == sha, "UNREVIEWED_CANDIDATE_COMMIT")
    manifest_files = record.get("assets")
    generated_files = record.get("generated")
    require(isinstance(manifest_files, list) and len(manifest_files) > 3,
            "EMPTY_WEB_ASSET_MANIFEST")
    require(isinstance(generated_files, list) and len(generated_files) == 3,
            "NATIVE_GENERATED_BUNDLES_INCOMPLETE")
    names = [x["path"] for x in manifest_files] + [x["path"] for x in generated_files]
    require(len(names) == len(set(names)), "DUPLICATE_ASSET")
    require(set(names) == enumerate_regular_files(candidate / "www"),
            "CANDIDATE_ASSET_LIST_DRIFT")
    required_generated = {
        "secure-assets/stage13-native-ready.js",
        "secure-assets/stage20-native-session.js",
        "secure-assets/stage14-local-work.js",
    }
    require({x["path"] for x in generated_files} == required_generated,
            "NATIVE_BRIDGES_MISSING")
    require({x["path"] for x in manifest_files if x.get("altered")} ==
            {"index.html", "secure-assets/index-inline-1.js"},
            "SOURCE_ASSET_MUTATION")
    for entry in manifest_files:
        rel = entry["path"]
        source = root / "web/maintrack/public" / rel
        output = candidate / "www" / rel
        require(source.is_file() and output.is_file(), "SOURCE_OR_CANDIDATE_ASSET_MISSING")
        require(sha256(source.read_bytes()) == entry["sourceHash"],
                "CANONICAL_SOURCE_HASH_CHANGED: " + rel)
        require(sha256(output.read_bytes()) == entry["nativeHash"],
                "STAGED_NATIVE_HASH_CHANGED: " + rel)
        require(source.read_bytes() != output.read_bytes() if entry["altered"]
                else source.read_bytes() == output.read_bytes(),
                "UNREVIEWED_ASSET_TRANSFORMATION: " + rel)
    for entry in generated_files:
        buf = (candidate / "www" / entry["path"]).read_bytes()
        require(sha256(buf) == entry["sha256"] and len(buf) == entry["bytes"],
                "GENERATED_NATIVE_BRIDGE_HASH_DRIFT")
    js = (candidate / "www/secure-assets/index-inline-1.js").read_text()
    html = (candidate / "www/index.html").read_text()
    require(NEW_API in js and OLD_API not in js, "UNREVIEWED_NATIVE_API")
    require(sha256(js.encode()) == record["stagedApiSha256"],
            "NATIVE_APP_JS_HASH_MISMATCH")
    require(sha256((root / "web/maintrack/public/secure-assets/index-inline-1.js").read_bytes()) ==
            record["sourceApiSha256"], "CANONICAL_JS_PROVENANCE_CHANGED")
    for required in required_generated:
        require(html.count('src="' + required + '"') == 1,
                "NATIVE_BRIDGE_NOT_LOADED_ONCE: " + required)
    require(html.index("Content-Security-Policy") <
            html.index("stage13-native-ready.js") <
            html.index("stage20-native-session.js") <
            html.index("index-inline-1.js") <
            html.index("stage14-local-work.js"), "NATIVE_SCRIPT_ORDER_INCORRECT")
    return record


def verify_android_synced(candidate=CANDIDATE, app=APP):
    source = candidate / "www"
    compiled = app / "android/app/src/main/assets/public"
    require(enumerate_regular_files(source) == enumerate_regular_files(compiled),
            "CAPACITOR_SYNC_ASSET_LIST_DRIFT")
    for rel in enumerate_regular_files(source):
        require((source / rel).read_bytes() == (compiled / rel).read_bytes(),
                "CAPACITOR_SYNC_BYTES_DIFFER: " + rel)
    main_activity = (app / "android/app/src/main/java/com/icc/maintrack/MainActivity.java").read_text()
    plugin = (app / "android/app/src/main/java/com/icc/maintrack/MainTrackSecureSessionPlugin.java").read_text()
    manifest = (app / "android/app/src/main/AndroidManifest.xml").read_text()
    gradle = (app / "android/app/build.gradle").read_text()
    require("registerPlugin(MainTrackSecureSessionPlugin.class)" in main_activity,
            "MISSING_NATIVE_PLUGIN_REGISTRATION")
    require("AndroidKeyStore" in plugin and "AES/GCM/NoPadding" in plugin,
            "MISSING_ANDROID_KEYSTORE_SESSION_PLUGIN")
    for attribute in ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"',
                      'android:networkSecurityConfig="@xml/maintrack_network_security"']:
        require(attribute in manifest, "ANDROID_SECURITY_CONFIG_REGRESSION: " + attribute)
    require(re.search(r"\bversionCode\s+405\b", gradle) is not None,
            "GRADLE_VERSION_CODE_NOT_405")
    require(re.search(r'\bversionName\s+"0\.4\.5"', gradle) is not None,
            "GRADLE_VERSION_NAME_NOT_045")
    return True


def parse_apk_identity(certificate_output, badging_output):
    m = re.search(r"Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})",
                  certificate_output)
    require(m is not None, "APK_SIGNING_CERT_UNREADABLE")
    match = re.search(
        r"^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'",
        badging_output, re.M)
    require(match is not None, "APK_AAPT_IDENTITY_UNREADABLE")
    package, code, version = match.groups()
    require(package == APP_ID, "APK_APP_ID_CHANGED")
    require(code == str(CODE), "APK_VERSION_CODE_NOT_405")
    require(version == NAME, "APK_VERSION_NAME_NOT_045")
    require(m.group(1).lower() == CERT, "APK_CERT_INCOMPATIBLE_WITH_INSTALLED_OWNER_APP")
    return {"appId": package, "versionCode": CODE, "versionName": NAME,
            "certificateSha256": m.group(1).lower()}


def verify_signed(apk, provenance, sdk, candidate=CANDIDATE):
    require(apk.is_file() and apk.stat().st_size > 1_000_000, "SIGNED_APK_MISSING_OR_TOO_SMALL")
    require((sdk / "apksigner").is_file() and (sdk / "aapt").is_file(),
            "ANDROID_BUILD_TOOLS_MISSING")
    signature = subprocess.run([str(sdk / "apksigner"), "verify",
                                "--verbose", "--print-certs", str(apk)],
                               text=True, capture_output=True, check=True).stdout
    identity = subprocess.run([str(sdk / "aapt"), "dump", "badging", str(apk)],
                              text=True, capture_output=True, check=True).stdout
    info = parse_apk_identity(signature, identity)
    candidate_record = verify_candidate(candidate)
    info.update({
        "schema": 1, "channel": "OWNER_QA_ONLY",
        "sourceCommit": candidate_record["sourceCommit"],
        "sourceGitBlob": candidate_record["sourceGitBlob"],
        "stagedAppJsSha256": candidate_record["stagedApiSha256"],
        "apkSha256": sha256(apk.read_bytes()), "apkBytes": apk.stat().st_size,
        "ownerInstallAccepted": False, "sessionUpgradeDeviceTest": "NOT_RUN",
        "offlineQueuePreservationTest": "NOT_RUN", "employeeRelease": False,
        "rolloutEnabled": False, "deployed": False
    })
    provenance.write_text(json.dumps(info, indent=2) + "\n")
    return info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["candidate", "android-sync", "signed"],
                        required=True)
    parser.add_argument("--apk", type=Path)
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--sdk-build-tools", type=Path)
    args = parser.parse_args()
    if args.mode == "candidate":
        record = verify_candidate()
        print("PASS reviewed native 405 QA source and cryptographic asset hashes:",
              record["sourceCommit"])
    elif args.mode == "android-sync":
        verify_candidate()
        verify_android_synced()
        print("PASS Capacitor Android assets, secure Keystore session bridge and 405 Gradle identity")
    else:
        require(all([args.apk, args.provenance, args.sdk_build_tools]),
                "APK_VERIFICATION_ARGUMENTS_REQUIRED")
        info = verify_signed(args.apk, args.provenance, args.sdk_build_tools)
        print("PASS signed Owner QA APK has installed-app compatible certificate, package and 405 code:",
              info["apkSha256"])
        print("OWNER_INSTALL_NOT_TESTED / NO_PRODUCTION / NO_EMPLOYEE_DISTRIBUTION")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error) if isinstance(error, ValueError) else
              "BLOCKED: SIGNED_APK_OR_SOURCE_VERIFICATION_FAILED", file=sys.stderr)
        raise SystemExit(1)
