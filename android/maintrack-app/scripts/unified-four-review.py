"""Build immutable *unsigned, non-deployable* Web/Android review artifacts.

Strictly isolates this feature branch and never edits existing approved locks,
published OTA metadata, Vercel deployment aliases, or installed APKs.
"""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
PUBLIC = REPO / "web/maintrack/public"
REVIEW = ROOT / "unified-four-review"
EXPECTED_BRANCH = "feature/maintrack-unified-four-updates-20261017"
MAY_CHANGE = {
    "index.html",
    "secure-assets/index-inline-1.js",
    "secure-assets/index-inline-1.css",
}
LOCAL_CONTRACT = {"reportQueue": 1, "writesReportQueue": 1, "migration": "none"}


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def entry(data):
    return {"sha256": sha(data), "bytes": len(data)}


def safe_name(name):
    return (
        isinstance(name, str) and name and not name.startswith("/")
        and "\\" not in name and all(p not in ("", ".", "..") for p in name.split("/"))
    )


def zipdir(where, target):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(where.rglob("*")):
            if p.is_file():
                check(not p.is_symlink(), "SYMLINK_IN_ARTIFACT")
                name = p.relative_to(where).as_posix()
                info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, p.read_bytes())


def build():
    head = git("rev-parse", "HEAD")
    valid = (git("branch", "--show-current") == EXPECTED_BRANCH
             or (os.environ.get("GITHUB_REF") == "refs/heads/" + EXPECTED_BRANCH
                 and os.environ.get("GITHUB_SHA") == head))
    check(valid, "WRONG_QA_BRANCH_OR_UNPINNED_CI")
    check(not git("diff", "HEAD", "--name-only"), "COMMIT_TRACKED_CHANGES_BEFORE_BUILD")
    check(not REVIEW.exists(), "REVIEW_OUTPUT_ALREADY_EXISTS")
    source = json.loads((REPO / "web/maintrack/source-lock.json").read_text())
    accepted = json.loads((ROOT / "approved-assets.lock.json").read_text())
    check(source == accepted, "SOURCE_AND_ANDROID_BASELINE_LOCK_DIFFER")
    check(len(source["assets"]) == 18, "BASELINE_RESOURCE_COUNT_CHANGED")
    changes = []
    original = {}
    for item in source["assets"]:
        name = item["path"]
        check(safe_name(name), "UNSAFE_ASSET_PATH: " + str(name))
        file = PUBLIC / name
        check(file.is_file() and not file.is_symlink(), "MISSING_OR_SYMLINK: " + name)
        data = file.read_bytes()
        original[name] = data
        actual = entry(data)
        # Original index native snapshot special-cases nativeIndex. The new
        # index is changed, so the comparison intentionally uses source asset.
        if actual != {k: item[k] for k in ("sha256", "bytes")}:
            check(name in MAY_CHANGE, "UNREVIEWED_SOURCE_DRIFT: " + name)
            changes.append(name)
    check(set(changes) == MAY_CHANGE, "UNEXPECTED_CHANGED_ASSET_SET: " + repr(changes))
    frontend = original["secure-assets/index-inline-1.js"].decode("utf-8")
    html = original["index.html"].decode("utf-8")
    check("maintrack-stage9-security-api/api" in frontend, "PRODUCTION_API_SOURCE_MISSING")
    check("maintrack-unified-four-qa/api" not in frontend, "STAGING_API_URL_LEAK")
    for token in ("accountSummary", "FUTURE_OVERTIME_NOT_ALLOWED",
                  "historyFilterFinancial", "historyFilterSubstitute"):
        check(token in frontend, "FEATURE_MISSING: " + token)
    for token in ("accountLeaveDetails", "accountOvertimeDetails",
                  "accountHistoryDetails", "Content-Security-Policy"):
        check(token in html, "FEATURE_OR_CSP_MISSING: " + token)
    check("http-equiv=\"refresh\"" not in html, "UNSAFE_AUTO_NAVIGATION")
    check("script-src-attr 'none'" in html, "CSP_WEAKENED")
    # Explicitly leave the stable API untouched: frontend candidate must not
    # be deployed until backward-compatible API promotion is separately passed.
    native = REVIEW / "native/www"
    web = REVIEW / "web/.vercel/output/static/releases" / head
    for name, data in original.items():
        for base in (native, web):
            out = base / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)

    esbuild = ROOT / "node_modules/.bin/esbuild"
    check(esbuild.is_file(), "RUN_NPM_CI_FIRST")
    def bundle(sourcefile, outfile, define=None):
        outfile.parent.mkdir(parents=True, exist_ok=True)
        command = [str(esbuild), str(ROOT / sourcefile), "--bundle",
                   "--format=iife", "--platform=browser", "--target=es2022",
                   "--minify", "--outfile=" + str(outfile)]
        if define is not None:
            command.append("--define:__MAINTRACK_WEB_CONFIG__=" + json.dumps(define, separators=(",", ":")))
        subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.DEVNULL)

    bundle("update-system/startup.mjs", native / "secure-assets/stage13-native-ready.js")
    bundle("update-system/local-work-startup.mjs", native / "secure-assets/stage14-local-work.js")
    native_html = (native / "index.html").read_text()
    native_html = native_html.replace("<head>",
        '<head>\\n<script src="secure-assets/stage13-native-ready.js"></script>', 1)
    native_html = native_html.replace("</body>",
        '<script src="secure-assets/stage14-local-work.js"></script></body>', 1)
    (native / "index.html").write_text(native_html)

    # Build the Web update UI from the *same* locked feature branch source.
    bundle("update-system/web-entry.mjs", web / "secure-assets/web-update.js", {"commit": head})
    shutil.copyfile(ROOT / "update-system/web-panel.css", web / "secure-assets/web-update.css")
    web_html = (web / "index.html").read_text()
    web_html = web_html.replace("</head>",
        '<link rel="stylesheet" href="secure-assets/web-update.css"></head>', 1)
    web_html = web_html.replace("</body>",
        '<script src="secure-assets/web-update.js"></script></body>', 1)
    (web / "index.html").write_text(web_html)

    # Shared resources must remain byte-identical except platform entrypoints.
    shared = sorted(set(original) - {"index.html", "manifest.webmanifest"})
    for name in shared:
        check((native / name).read_bytes() == (web / name).read_bytes(),
              "CROSS_CHANNEL_ASSET_MISMATCH: " + name)
    # A new isolated Preview build must not be mistaken for a stable-host update.
    config = {
        "version": 3,
        "routes": [
            {"src": "/(.*)", "headers": {"X-Robots-Tag": "noindex, nofollow"}, "continue": True},
            {"src": "/", "status": 307, "headers": {
                "Location": "/releases/" + head + "/", "Cache-Control": "no-store"}},
            {"src": "/maintrack-release.json", "headers": {"Cache-Control": "no-store"}, "continue": True},
            {"src": "/releases/(.*)", "headers": {"Cache-Control": "public, max-age=31536000, immutable"}, "continue": True},
            {"handle": "filesystem"},
            {"src": "/(.*)", "status": 404},
        ],
    }
    top = REVIEW / "web/.vercel/output"
    static_root = top / "static"
    # Review-only discovery metadata; NOT published to a stable or employee host.
    (static_root / "maintrack-release.json").write_text(json.dumps({
        "schema": 1, "appId": "com.icc.maintrack", "channel": "web-pilot",
        "commit": head, "path": "/releases/" + head + "/",
        "expiresAt": 0  # deliberately unusable until an approved release publisher regenerates it
    }, separators=(",", ":")) + "\\n")
    (top / "config.json").write_text(json.dumps(config, indent=2) + "\\n")
    manifest = {
        "schema": 1, "mode": "review-only", "signed": False,
        "deployable": False, "rolloutEnabled": False, "gitCommit": head,
        "branch": EXPECTED_BRANCH, "appId": "com.icc.maintrack",
        "backendRequirement": "promote stable stage9 API after role/compatibility tests",
        "localData": LOCAL_CONTRACT,
        "changedFromApprovedBaseline": sorted(changes),
        "baselineSourceDeployment": source["sourceDeployment"],
        "webBasePath": "/releases/" + head + "/",
        "nativeFiles": {
            p.relative_to(native).as_posix(): entry(p.read_bytes())
            for p in sorted(native.rglob("*")) if p.is_file()
        },
        "webFiles": {
            p.relative_to(web).as_posix(): entry(p.read_bytes())
            for p in sorted(web.rglob("*")) if p.is_file()
        },
        "sharedAssetHashes": {p: entry(original[p]) for p in shared},
        "archives": {},
    }
    for directory, filename in (
        (native, "MainTrack-Android-OTA-UNSIGNED-REVIEW.zip"),
        (REVIEW / "web", "MainTrack-Web-REVIEW-ONLY.zip"),
    ):
        dest = REVIEW / filename
        zipdir(directory, dest)
        manifest["archives"][filename] = entry(dest.read_bytes())
    (REVIEW / "candidate.json").write_text(json.dumps(manifest, indent=2) + "\\n")
    print("PASS review-only synchronized candidate", head,
          "changed assets:", sorted(changes), "shared assets:", len(shared))


def verify():
    manifest = json.loads((REVIEW / "candidate.json").read_text())
    check(manifest["mode"] == "review-only" and not manifest["signed"]
          and not manifest["deployable"] and not manifest["rolloutEnabled"],
          "UNSAFE_RELEASE_MODE")
    check(manifest["gitCommit"] == git("rev-parse", "HEAD"), "WRONG_SOURCE_SHA")
    for filename, wanted in manifest["archives"].items():
        data = (REVIEW / filename).read_bytes()
        check(entry(data) == wanted, "ARCHIVE_CHECKSUM_MISMATCH: " + filename)
        with zipfile.ZipFile(REVIEW / filename) as z:
            check(len(z.namelist()) == len(set(z.namelist())), "DUPLICATE_MEMBERS")
            for member in z.namelist():
                check(safe_name(member), "UNSAFE_ARCHIVE_MEMBER")
                check(entry(z.read(member))["bytes"] >= 0, "INVALID_MEMBER")
    check(set(manifest["changedFromApprovedBaseline"]) == MAY_CHANGE,
          "UNREVIEWED_SOURCE_DRIFT")
    print("PASS review package SHA256/size, identities and release-disabled gates")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("build", "verify"):
        sys.exit("usage: python scripts/unified-four-review.py build|verify")
    (build if sys.argv[1] == "build" else verify)()
