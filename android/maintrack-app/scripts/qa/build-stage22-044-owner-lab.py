#!/usr/bin/env python3
"""Prepare 0.4.4 owner LAB OTA from an already-reviewed immutable Stage22 artifact.
The signed release is made separately in a protected GitHub environment.
"""
import hashlib
import io
import json
import os
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = ROOT / "stage22-044-lab"
REVIEW = ROOT / "reviewed-stage22" / "unified-four-review"
SOURCE = REVIEW / "MainTrack-Android-OTA-UNSIGNED-REVIEW.zip"
CANDIDATE = REVIEW / "candidate.json"
DEST = BASE / "maintrack-0.4.4.zip"
REPORT = BASE / "lab-build.json"
EXPECTED_SOURCE = "865229c4706e946377fba811d2f51dad1a815138"
EXPECTED_ZIP_SHA = "aabfa193d2d92db3dcc1881b5245a546ad0a236345b526e97b8c8defcfc7a39e"
OLD_API = b"https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api"
LAB_API = b"https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api"
CHANGED = "secure-assets/index-inline-1.js"

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def fingerprint(data):
    return {"sha256": digest(data), "bytes": len(data)}

def main():
    require(os.environ.get("GITHUB_REPOSITORY") == "m-as23/ICC-Reports", "WRONG_REPO")
    require(os.environ.get("GITHUB_REF") == "refs/heads/release/maintrack-stage22-044-integration", "WRONG_BRANCH")
    require(not DEST.exists(), "REFUSE_OVERWRITE_LOCAL_CANDIDATE")
    c = json.loads(CANDIDATE.read_text())
    require(c["gitCommit"] == EXPECTED_SOURCE and c["appId"] == "com.icc.maintrack", "WRONG_SOURCE_OR_APP")
    require(c["mode"] == "review-only" and c["signed"] is False and
            c["deployable"] is False and c["rolloutEnabled"] is False, "UNEXPECTED_SOURCE_RELEASE_MODE")
    contract = {"reportQueue": 1, "writesReportQueue": 1, "migration": "none"}
    require(c["localData"] == contract, "UNSAFE_LOCAL_DATA_CONTRACT")
    require(c["nativePilotUpdatePanel"]["trustedManifestUrl"] ==
            "https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json",
            "CHANGED_DEVICE_UPDATE_CHANNEL")
    require(c["nativePilotUpdatePanel"]["pinnedPublicKey"] ==
            json.loads((ROOT / "release/owner-public.json").read_text())["publicKeyBase64"], "CHANGED_SIGNING_ROOT")
    raw = SOURCE.read_bytes()
    require(digest(raw) == EXPECTED_ZIP_SHA, "UNAPPROVED_REVIEW_SHA")
    require(fingerprint(raw) == c["archives"][SOURCE.name], "REVIEW_SIZE_OR_DIGEST_DIFFERS")
    entries = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        infos = z.infolist()
        require(len(infos) == len(set(z.namelist())), "DUPLICATE_MEMBER")
        for i in infos:
            name = i.filename
            require(name and not name.startswith("/") and "\\" not in name and
                    all(part not in ("", ".", "..") for part in name.split("/")) and not i.is_dir(),
                    "UNSAFE_ZIP_PATH")
            require(((i.external_attr >> 16) & 0o170000) not in (0o120000, 0o040000), "UNSAFE_ZIP_TYPE")
            entries[name] = z.read(i)
    require(set(entries) == set(c["nativeFiles"]), "REVIEW_MEMBER_LIST_CHANGED")
    for name, data in entries.items():
        require(fingerprint(data) == c["nativeFiles"][name], "REVIEW_MEMBER_DIGEST_CHANGED: " + name)
    require(CHANGED in entries and "index.html" in entries, "MISSING_APP_SHELL")
    require(entries[CHANGED].count(OLD_API) == 1 and LAB_API not in entries[CHANGED],
            "API_REWRITE_MUST_BE_EXACTLY_ONCE")
    entries[CHANGED] = entries[CHANGED].replace(OLD_API, LAB_API, 1)
    html = entries["index.html"]
    for required in (b"stage15-pilot-update.js", b"stage14-local-work.js",
                     b"stage13-native-ready.js", b"https://raw.githubusercontent.com"):
        require(required in html, "MISSING_TRUSTED_NATIVE_COMPONENT")
    require(b"stage20-native-session.js" in html, "MISSING_NATIVE_SESSION_FALLBACK")
    BASE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DEST, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, entries[name])
    out = DEST.read_bytes()
    require(100 < len(out) <= 15_000_000, "OTA_SIZE_LIMIT")
    with zipfile.ZipFile(io.BytesIO(out)) as z:
        require(z.namelist() == sorted(entries), "ZIP_LAYOUT_CHANGED")
        for name, value in entries.items():
            require(z.read(name) == value, "ZIP_VERIFICATION_FAILED")
    record = {
        "schema": 1, "status": "BUILT_NOT_SIGNED_NOT_PUBLISHED",
        "channel": "lab", "version": "0.4.4", "appId": "com.icc.maintrack",
        "sourceCommit": EXPECTED_SOURCE, "sourceReviewRun": 39127423740,
        "backend": "maintrack-unified-four-qa", "changedArchiveMembers": [CHANGED],
        "archive": fingerprint(out), "reviewedZip": fingerprint(raw), "localData": contract
    }
    REPORT.write_text(json.dumps(record, indent=2) + "\n")
    print("PASS STAGE22_044_OWNER_LAB_UNSIGNED_PREPARE", fingerprint(out))

if __name__ == "__main__":
    main()
