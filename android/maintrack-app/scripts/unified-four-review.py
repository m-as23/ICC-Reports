"""Build immutable *unsigned, non-deployable* Web/Android review artifacts.

Strictly isolates this feature branch and never edits existing approved locks,
published OTA metadata, Vercel deployment aliases, or installed APKs.
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
PUBLIC = REPO / "web/maintrack/public"
REVIEW = ROOT / "unified-four-review"
EXPECTED_BRANCHES = {"feature/maintrack-unified-four-updates-20261017", "fix/maintrack-pilot-session-candidate-20261018"}
PILOT_BADGE = re.compile(r'<div role="note" aria-label="Pilot demo system"[^>]*>🧪 PILOT — بلاغات تجريبية فقط</div>')
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


def remove_pilot_badge(html):
    """Never ship the staging-only floating overlay in a release candidate."""
    check(len(PILOT_BADGE.findall(html)) == 1, "PILOT_BADGE_EXPECTED_ONCE")
    result = PILOT_BADGE.sub("", html)
    check(not PILOT_BADGE.search(result), "PILOT_BADGE_REMOVAL_FAILED")
    return result


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
    valid = (git("branch", "--show-current") in EXPECTED_BRANCHES
             or (os.environ.get("GITHUB_REF", "").removeprefix("refs/heads/") in EXPECTED_BRANCHES
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
    def bundle(sourcefile, outfile, define=None, define_name='__MAINTRACK_WEB_CONFIG__'):
        outfile.parent.mkdir(parents=True, exist_ok=True)
        command = [str(esbuild), str(ROOT / sourcefile), "--bundle",
                   "--format=iife", "--platform=browser", "--target=es2022",
                   "--minify", "--outfile=" + str(outfile)]
        if define is not None:
            command.append("--define:" + define_name + "=" + json.dumps(define, separators=(",", ":")))
        subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.DEVNULL)

    bundle("update-system/native-session-entry.mjs", native / "secure-assets/stage20-native-session.js")
    bundle("update-system/startup.mjs", native / "secure-assets/stage13-native-ready.js")
    bundle("update-system/local-work-startup.mjs", native / "secure-assets/stage14-local-work.js")
    # The installed Android app must retain its existing trusted OTA updater UI,
    # otherwise the user cannot receive the next update without installing APK.
    trusted_config = json.loads((ROOT / "release/owner-public.json").read_text())
    check(trusted_config.get("schema") == 1 and trusted_config.get("channel") == "lab",
          "UNEXPECTED_OWNER_PILOT_CONFIG")
    check(trusted_config.get("manifestUrl") ==
          "https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json",
          "NATIVE_UPDATE_CHANNEL_CHANGED")
    check(trusted_config.get("allowedOrigins") == ["https://raw.githubusercontent.com"],
          "NATIVE_UPDATE_ALLOWED_ORIGINS_CHANGED")
    check(len(trusted_config.get("publicKeyBase64", "")) == 43,
          "INVALID_PINNED_OWNER_PUBLIC_KEY")
    bundle("update-system/pilot-entry.mjs",
           native / "secure-assets/stage15-pilot-update.js",
           trusted_config, "__MAINTRACK_PILOT_CONFIG__")
    shutil.copyfile(ROOT / "update-system/pilot-panel.css",
                    native / "secure-assets/stage15-pilot-update.css")
    native_html = remove_pilot_badge((native / "index.html").read_text())
    native_html = native_html.replace("<head>",
        '<head>\n<script src="secure-assets/stage20-native-session.js"></script>', 1)
    native_html = native_html.replace("<head>",
        '<head>\n<script src="secure-assets/stage13-native-ready.js"></script>', 1)
    expected_csp = "connect-src 'self' https://tdnkeskczcsukcujwinu.supabase.co;"
    check(native_html.count(expected_csp) == 1, "UNEXPECTED_NATIVE_CSP")
    native_html = native_html.replace(
        expected_csp,
        "connect-src 'self' https://tdnkeskczcsukcujwinu.supabase.co https://raw.githubusercontent.com;"
    )
    native_html = native_html.replace("</head>",
        '<link rel="stylesheet" href="secure-assets/stage15-pilot-update.css"></head>', 1)
    native_html = native_html.replace("</body>",
        '<script src="secure-assets/stage14-local-work.js"></script>'
        '<script src="secure-assets/stage15-pilot-update.js"></script></body>', 1)
    check("secure-assets/stage15-pilot-update.js" in native_html and
          native_html.index("stage14-local-work.js") < native_html.index("stage15-pilot-update.js"),
          "NATIVE_UPDATE_UI_MISSING_OR_BAD_ORDER")
    check("secure-assets/stage20-native-session.js" in native_html,
          "NATIVE_SECURE_SESSION_ENTRY_MISSING")
    check("__MAINTRACK_PILOT_CONFIG__" not in
          (native / "secure-assets/stage15-pilot-update.js").read_text(),
          "UPDATE_PUBLIC_CONFIG_NOT_PINNED")
    (native / "index.html").write_text(native_html)

    # Browser activation needs the SAME trusted dirty-form and local queue reader
    # as native. Missing MainTrackLocalWork would fail closed forever; bypassing
    # it would risk losing an unsent report or overtime draft.
    shutil.copyfile(native / "secure-assets/stage14-local-work.js",
                    web / "secure-assets/stage14-local-work.js")
    bundle("update-system/web-entry.mjs", web / "secure-assets/web-update.js", {"commit": head})
    shutil.copyfile(ROOT / "update-system/web-panel.css", web / "secure-assets/web-update.css")
    web_html = remove_pilot_badge((web / "index.html").read_text())
    web_html = web_html.replace("</head>",
        '<link rel="stylesheet" href="secure-assets/web-update.css"></head>', 1)
    web_html = web_html.replace("</body>",
        '<script src="secure-assets/stage14-local-work.js"></script>'
        '<script src="secure-assets/web-update.js"></script></body>', 1)
    check(web_html.index("stage14-local-work.js") < web_html.index("web-update.js"),
          "WEB_UPDATE_LOCAL_WORK_GUARD_NOT_READY")
    (web / "index.html").write_text(web_html)

    # Shared resources must remain byte-identical except platform entrypoints.
    shared = sorted(set(original) - {"index.html", "manifest.webmanifest"})
    check((native / "secure-assets/stage14-local-work.js").read_bytes() ==
          (web / "secure-assets/stage14-local-work.js").read_bytes(),
          "LOCAL_WORK_GUARD_DIFFERS_ACROSS_CHANNELS")
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
    }, separators=(",", ":")) + "\n")
    (top / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    manifest = {
        "schema": 1, "mode": "review-only", "signed": False,
        "deployable": False, "rolloutEnabled": False, "gitCommit": head,
        "branch": git("branch", "--show-current"), "appId": "com.icc.maintrack",
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
        "sharedLocalWorkGuard": entry((native / "secure-assets/stage14-local-work.js").read_bytes()),
        "nativePilotUpdatePanel": {
            "script": entry((native / "secure-assets/stage15-pilot-update.js").read_bytes()),
            "styles": entry((native / "secure-assets/stage15-pilot-update.css").read_bytes()),
            "pinnedPublicKey": trusted_config["publicKeyBase64"],
            "trustedManifestUrl": trusted_config["manifestUrl"],
        },
        "archives": {},
    }
    for directory, filename in (
        (native, "MainTrack-Android-OTA-UNSIGNED-REVIEW.zip"),
        (REVIEW / "web", "MainTrack-Web-REVIEW-ONLY.zip"),
    ):
        dest = REVIEW / filename
        zipdir(directory, dest)
        manifest["archives"][filename] = entry(dest.read_bytes())
    (REVIEW / "candidate.json").write_text(json.dumps(manifest, indent=2) + "\n")
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
            html_members = [m for m in z.namelist() if m.endswith("/index.html") or m == "index.html"]
            check(len(html_members) == 1, "EXPECTED_SINGLE_ENTRY_HTML")
            for member in z.namelist():
                check(safe_name(member), "UNSAFE_ARCHIVE_MEMBER")
                check(entry(z.read(member))["bytes"] >= 0, "INVALID_MEMBER")
            check(not PILOT_BADGE.search(z.read(html_members[0]).decode("utf-8")),
                  "PILOT_BADGE_IN_DELIVERY_ARCHIVE")
    check(set(manifest["changedFromApprovedBaseline"]) == MAY_CHANGE,
          "UNREVIEWED_SOURCE_DRIFT")
    guard = manifest.get("sharedLocalWorkGuard")
    check(guard is not None and guard ==
          entry((REVIEW / "native/www/secure-assets/stage14-local-work.js").read_bytes()) ==
          entry((REVIEW / "web/.vercel/output/static/releases" /
                 manifest["gitCommit"] / "secure-assets/stage14-local-work.js").read_bytes()),
          "SHARED_LOCAL_WORK_GUARD_INVALID")
    native_entry = (REVIEW / "native/www/secure-assets/stage20-native-session.js")
    check(native_entry.is_file() and native_entry.stat().st_size > 0,
          "NATIVE_SESSION_BRIDGE_MISSING")
    panel = manifest.get("nativePilotUpdatePanel")
    check(panel and len(panel["pinnedPublicKey"]) == 43 and
          panel["trustedManifestUrl"] ==
          "https://raw.githubusercontent.com/m-as23/ICC-Reports/android/stage14-ota-native-lab/updates/android/release.json",
          "OTA_UPDATE_PANEL_NOT_PINNED")
    for key, name in (("script", "stage15-pilot-update.js"),
                      ("styles", "stage15-pilot-update.css")):
        p = REVIEW / "native/www/secure-assets" / name
        check(entry(p.read_bytes()) == panel[key], "OTA_PANEL_HASH_CHANGED")
    print("PASS review package SHA256/size, identities and release-disabled gates")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("build", "verify"):
        sys.exit("usage: python scripts/unified-four-review.py build|verify")
    (build if sys.argv[1] == "build" else verify)()
