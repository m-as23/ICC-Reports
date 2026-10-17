#!/usr/bin/env python3
"""Create QA-only 0.4.3 OTA bytes from owner-reviewed immutable feature bundle.

The only allowed change is replacing the stable API URL with the active QA Edge API
inside secure-assets/index-inline-1.js. Never mutate production or owner keys.
"""
import hashlib
import io
import json
import pathlib
import sys
import zipfile

BASE = pathlib.Path(__file__).resolve().parents[1] / "pilot-043"
SOURCE = BASE / "MainTrack-Android-OTA-UNSIGNED-REVIEW.zip"
OUTPUT = BASE / "maintrack-0.4.3.zip"
MANIFEST = BASE / "candidate.json"
SOURCE_API = b"https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api"
QA_API = b"https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-unified-four-qa/api"
SOURCE_SHA = "7290df3ad14e94b4680cb41a6634fba16ecc6af1"
MODIFIED = "secure-assets/index-inline-1.js"


def check(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def entry(data):
    return {"sha256": sha(data), "bytes": len(data)}


def make():
    candidate = json.loads(MANIFEST.read_text())
    check(candidate["gitCommit"] == SOURCE_SHA, "UNEXPECTED_CANDIDATE_COMMIT")
    check(candidate["mode"] == "review-only" and candidate["signed"] is False and
          candidate["deployable"] is False and candidate["rolloutEnabled"] is False,
          "CANDIDATE_IS_RELEASED")
    check(candidate["appId"] == "com.icc.maintrack", "WRONG_APP_ID")
    check(candidate["localData"] == {
        "reportQueue": 1, "writesReportQueue": 1, "migration": "none"
    }, "INCOMPATIBLE_LOCAL_DATA")
    check(entry(SOURCE.read_bytes()) ==
          candidate["archives"][SOURCE.name], "UNTRUSTED_ARCHIVE_DIGEST")
    check(not OUTPUT.exists(), "VERSION_ALREADY_BUILT")
    data = {}
    with zipfile.ZipFile(SOURCE) as z:
        names = z.namelist()
        check(len(names) == len(set(names)), "DUPLICATE_ZIP_MEMBER")
        for member in names:
            check(member and not member.startswith("/") and
                  "\\" not in member and all(p not in ("", ".", "..")
                  for p in member.split("/")), "ZIP_SLIP")
            data[member] = z.read(member)
    check("index.html" in data and MODIFIED in data and
          "secure-assets/stage15-pilot-update.js" in data and
          "secure-assets/stage14-local-work.js" in data, "OTA_COMPONENTS_MISSING")
    check(SOURCE_API in data[MODIFIED] and data[MODIFIED].count(SOURCE_API) == 1 and
          QA_API not in data[MODIFIED], "API_SOURCE_NOT_UNIQUE")
    old = data[MODIFIED]
    data[MODIFIED] = old.replace(SOURCE_API, QA_API, 1)
    check(SOURCE_API not in data[MODIFIED] and QA_API in data[MODIFIED],
          "API_REWRITE_FAILED")
    check("stage15-pilot-update.js" in data["index.html"].decode() and
          "stage14-local-work.js" in data["index.html"].decode(),
          "NATIVE_UPDATE_AND_LOCAL_GUARDS_MISSING")
    check(b"https://raw.githubusercontent.com" in data["index.html"],
          "TRUSTED_OTA_MANIFEST_ORIGIN_MISSING")
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name in sorted(data):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data[name])
    updated = OUTPUT.read_bytes()
    check(100 < len(updated) <= 15_000_000, "OTA_SIZE_INVALID")
    with zipfile.ZipFile(io.BytesIO(updated)) as z:
        check(z.namelist() == sorted(data), "OTA_ZIP_FILELIST_CHANGED")
        for name in data:
            check(z.read(name) == data[name], "OTA_ZIP_MEMBER_CORRUPTED")
    result = {
        "schema": 1, "purpose": "single-installed-device-qa",
        "version": "0.4.3", "appId": "com.icc.maintrack",
        "sourceCommit": SOURCE_SHA, "sourceRunId": 39067507471,
        "api": "maintrack-unified-four-qa",
        "archive": entry(updated),
        "changedArchiveMembers": [MODIFIED],
        "localData": candidate["localData"],
        "signed": False
    }
    (BASE / "pilot-build.json").write_text(json.dumps(result, indent=2) + "\n")
    print("PASS pilot OTA zip immutable bytes, exact one API rewrite, trusted update panel and local-work guard:", len(updated))


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] != "make":
        sys.exit("usage: python3 scripts/pilot-043-bundle.py make")
    make()
