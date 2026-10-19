#!/usr/bin/env python3
"""Fail-closed validation for MainTrack 0.4.6/406 Owner-only UI hotfix APK.

Native source derives from the unchanged, already reviewed 405 bundle pipeline.
The installed APK is a new version (406); 405 signing/release code stays intact.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "android/maintrack-app"
CANDIDATE = ROOT / "audit-output/native-405-qa"
APP_ID = "com.icc.maintrack"
CERT = "07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b"
CODE = 406
NAME = "0.4.6"

spec = importlib.util.spec_from_file_location(
    "maintrack_405_verifier", Path(__file__).with_name("verify-native-405-build.py"))
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)


def require(condition, reason):
    if not condition:
        raise ValueError("BLOCKED: " + reason)


def ui_assertions(www):
    html = (www / "index.html").read_text()
    js = (www / "v6-core.js").read_text()
    css = (www / "v6-core.css").read_text()
    require("PILOT — بلاغات تجريبية فقط" not in html and
            'aria-label="Pilot demo system"' not in html,
            "OWNER_REJECTED_PILOT_OVERLAY_PRESENT")
    require("v6Dock" not in js and "shortcuts" not in js and
            "v6Dock" not in css, "OWNER_REJECTED_BOTTOM_DOCK_PRESENT")
    require("padding-bottom:calc(78px" not in css and
            "bottom:calc(76px" not in css, "BOTTOM_DOCK_RESERVED_SPACE")
    require("toggle.id='v6Toggle'" in js and "v6Drawer" in js and
            "toggle.onclick" in js and "tabs.addEventListener" in js,
            "MOBILE_SIDEBAR_REGRESSION")
    require('src="v6.js"' in html and
            'src="secure-assets/index-inline-1.js"' in html,
            "MAINTRACK_UI_SCRIPTS_MISSING")
    return True


def verify_candidate():
    rec = previous.verify_candidate()
    ui_assertions(CANDIDATE / "www")
    return rec


def verify_android():
    verify_candidate()
    previous.verify_synced_asset_tree(
        CANDIDATE / "www", APP / "android/app/src/main/assets/public")
    main_activity = (APP / "android/app/src/main/java/com/icc/maintrack/MainActivity.java").read_text()
    plugin = (APP / "android/app/src/main/java/com/icc/maintrack/MainTrackSecureSessionPlugin.java").read_text()
    manifest = (APP / "android/app/src/main/AndroidManifest.xml").read_text()
    gradle = (APP / "android/app/build.gradle").read_text()
    require("registerPlugin(MainTrackSecureSessionPlugin.class)" in main_activity,
            "MISSING_NATIVE_SESSION_PLUGIN")
    require("AndroidKeyStore" in plugin and "AES/GCM/NoPadding" in plugin,
            "ANDROID_KEYSTORE_SESSION_CHANGED")
    for attribute in ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"',
                      'android:networkSecurityConfig="@xml/maintrack_network_security"']:
        require(attribute in manifest, "ANDROID_SECURITY_DRIFT: " + attribute)
    require(re.search(r"\bversionCode\s+406\b", gradle) is not None and
            re.search(r'\bversionName\s+"0\.4\.6"', gradle) is not None,
            "SIGNED_APK_GRADLE_VERSION_WRONG")
    return True


def verify_signed(apk, output, sdk):
    require(apk.is_file() and apk.stat().st_size > 1_000_000,
            "MISSING_SIGNED_APK")
    require((sdk / "apksigner").is_file() and (sdk / "aapt").is_file(),
            "MISSING_ANDROID_VERIFICATION_TOOLS")
    record = verify_candidate()
    signature = subprocess.run([str(sdk / "apksigner"), "verify", "--verbose",
                                "--print-certs", str(apk)],
                               text=True, capture_output=True, check=True).stdout
    badging = subprocess.run([str(sdk / "aapt"), "dump", "badging", str(apk)],
                             text=True, capture_output=True, check=True).stdout
    match = re.search(r"Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]{64})",
                      signature)
    require(match is not None and match.group(1).lower() == CERT,
            "APK_CERT_NOT_SAME_AS_OWNER_DEVICE")
    ident = re.search(r"^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'",
                      badging, re.M)
    require(ident is not None and ident.groups() == (APP_ID, str(CODE), NAME),
            "APK_ID_OR_VERSION_NOT_406")
    # Verify the signed APK contains the *reviewed* UI bytes, not just an
    # earlier checked working directory or a stale Gradle output.
    reviewed = CANDIDATE / "www"
    files = previous.enumerate_regular_files(reviewed)
    with zipfile.ZipFile(apk) as archive:
        archived = set(archive.namelist())
        for rel in sorted(files):
            name = "assets/public/" + rel
            require(name in archived, "APK_MISSING_REVIEWED_UI: " + rel)
            require(archive.read(name) == (reviewed / rel).read_bytes(),
                    "APK_UI_ASSET_MISMATCH: " + rel)
        ui_assertions_source = archive.read("assets/public/index.html").decode("utf-8")
        require("PILOT — بلاغات تجريبية فقط" not in ui_assertions_source,
                "APK_PILOT_OVERLAY_REINTRODUCED")
    result = {
        "schema": 1, "channel": "OWNER_QA_ONLY", "appId": APP_ID,
        "versionCode": CODE, "versionName": NAME,
        "certificateSha256": CERT, "sourceCommit": record["sourceCommit"],
        "sourceCandidateVersionCode": 405,
        "sourceGitBlob": record["sourceGitBlob"],
        "stagedAppJsSha256": record["stagedApiSha256"],
        "reviewedAssetCount": len(files),
        "bottomDockRemoved": True, "pilotOverlayRemoved": True,
        "apkSha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
        "apkBytes": apk.stat().st_size,
        "ownerInstallAccepted": False, "sessionUpgradeDeviceTest": "NOT_RUN",
        "offlineQueuePreservationTest": "NOT_RUN",
        "employeeRelease": False, "rolloutEnabled": False, "deployed": False
    }
    output.write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=["candidate", "android-sync", "signed"])
    parser.add_argument("--apk", type=Path)
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--sdk-build-tools", type=Path)
    args = parser.parse_args()
    if args.mode == "candidate":
        record = verify_candidate()
        print("PASS exact clean UI, immutable reviewed 405 source and native bridges:",
              record["sourceCommit"])
    elif args.mode == "android-sync":
        verify_android()
        print("PASS native 406 Gradle, session, security and byte-exact UI assets")
    else:
        require(args.apk and args.provenance and args.sdk_build_tools,
                "SIGNATURE_PROOF_ARGS_REQUIRED")
        result = verify_signed(args.apk, args.provenance, args.sdk_build_tools)
        print("PASS signed 406 / clean UI / original certificate:",
              result["apkSha256"])
        print("OWNER_QA_ONLY / NO_OTA / NO_PRODUCTION / NO_EMPLOYEE_ROLLOUT")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as exc:
        print(str(exc) if isinstance(exc, ValueError)
              else "BLOCKED: SIGNED_APK_OR_SOURCE_VERIFICATION_FAILED", file=sys.stderr)
        raise SystemExit(1)
