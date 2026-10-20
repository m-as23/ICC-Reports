#!/usr/bin/env python3
"""READ-ONLY MainTrack owner-device QA preflight. No APK installs, no device writes."""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

EXPECTED_APP = "com.icc.maintrack"
EXPECTED_CERT = "07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b"
MIN_FUTURE_CODE = 405

def call(argv):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=20, check=False)
    return p.returncode, p.stdout + "\n" + p.stderr

def fingerprint(text):
    match = re.search(r"Signer #1 certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})", text)
    return re.sub(r"[^0-9a-f]", "", match.group(1).lower()) if match else None

def badging(text):
    match = re.search(r"package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'", text)
    if not match:
        raise ValueError("Cannot parse Android APK identity from aapt badging")
    return {"package":match.group(1), "versionCode":int(match.group(2)), "versionName":match.group(3)}

def main():
    ap = argparse.ArgumentParser(description="Inspect APK signing and connected device safely. No writes.")
    ap.add_argument("--apk", type=Path, required=False, help="local QA APK candidate to check, no install")
    ap.add_argument("--read-device", action="store_true", help="read-only adb list and package metadata")
    ap.add_argument("--self-test", action="store_true", help="parser checks only; no tools, files or device required")
    opts=ap.parse_args()
    if opts.self_test:
        mock_cert="Signer #1 certificate SHA-256 digest: "+EXPECTED_CERT
        mock_package="package: name='com.icc.maintrack' versionCode='405' versionName='0.4.5'"
        if fingerprint(mock_cert)!=EXPECTED_CERT or badging(mock_package)!={"package":EXPECTED_APP,"versionCode":405,"versionName":"0.4.5"}:
            raise ValueError("APK preflight self-test failed")
        print(json.dumps({"result":"PASS_PARSER_ONLY","deviceAccess":False,"apkSignatureChecked":False}))
        return 0
    if opts.apk is None:
        raise ValueError("--apk is required unless --self-test is set")
    candidate=opts.apk.resolve()
    if not candidate.is_file() or candidate.suffix.lower() != ".apk":
        raise ValueError("Provide an existing .apk file")
    for tool in ["apksigner","aapt"]:
        if not shutil.which(tool):
            raise RuntimeError(tool+" unavailable. Install Android SDK build-tools, do not bypass this gate.")
    status,sign=call(["apksigner","verify","--print-certs",str(candidate)])
    if status!=0:
        raise RuntimeError("APK signature verification FAILED")
    cert=fingerprint(sign)
    status,badge=call(["aapt","dump","badging",str(candidate)])
    if status!=0:
        raise RuntimeError("APK package inspector FAILED")
    identity=badging(badge)
    check={"signatureVerified":True,
           "certificateMatchesInstalledOwnerBaseline":cert==EXPECTED_CERT,
           "applicationIdMatches":identity["package"]==EXPECTED_APP,
           "nativeVersionMeetsReleaseFloor":identity["versionCode"]>=MIN_FUTURE_CODE}
    report={"candidate":candidate.name,"package":identity,"checks":check}
    if opts.read_device:
        if not shutil.which("adb"):
            raise RuntimeError("adb is unavailable; no device commands were issued")
        status,devices=call(["adb","devices"])
        connected=[line.split("\t")[0] for line in devices.splitlines() if line.endswith("\tdevice")]
        if status!=0 or len(connected)!=1:
            raise RuntimeError("Expected exactly one authorized Android device")
        status,details=call(["adb","-s",connected[0],"shell","dumpsys","package",EXPECTED_APP])
        if status!=0 or "versionCode=" not in details:
            raise RuntimeError("Cannot read existing owner app package metadata")
        installed=re.search(r"versionCode=(\d+)",details)
        report["device"]={"connected":True,"installedVersionCode":int(installed.group(1)) if installed else None}
    report["result"]="PASS_CANDIDATE_ONLY" if all(check.values()) else "BLOCKED"
    report["physicalUpgradeTested"]=False
    report["otaRollbackOnDeviceTested"]=False
    report["installedAppModified"]=False
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if report["result"]!="PASS_CANDIDATE_ONLY":
        return 2
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except (RuntimeError,ValueError,subprocess.TimeoutExpired) as exc:
        print(json.dumps({"result":"BLOCKED","reason":str(exc)}),file=sys.stderr)
        sys.exit(2)
