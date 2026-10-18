#!/usr/bin/env python3
"""Prepare an UNPUBLISHED Android 0.4.4 UX+native-session QA candidate.
Base is the SHA-pinned owner-signed OTA 0.4.4, not an arbitrary old web tree.
Only v6-core.js and v6-core.css may differ in the WebView payload.
Native SecureSessionPlugin is compiled separately into the Android APK.
"""
import hashlib, io, json, pathlib, subprocess, sys, zipfile

BASE_SHA = "86c514750b2a30950c1882f2d8a350cff62c41bcb241d43085ef2c5085456843"
APP = "com.icc.maintrack"
REVIEWED = "865229c4706e946377fba811d2f51dad1a815138"
ALLOWED = ("v6-core.js", "v6-core.css")
ROOT = pathlib.Path(__file__).resolve().parents[4]
PUBLIC = ROOT / "web/maintrack/public"
QA = ROOT / "android/maintrack-app/two-fixes-qa"
SRC = QA / "owner-signed-044.zip"
DEST = QA / "native/www"
OUTPUT = QA / "maintrack-044-TWO-ISSUES-UNSIGNED-REVIEW-ONLY.zip"

def ensure(ok, reason):
    if not ok: raise RuntimeError(reason)

def sha(data): return hashlib.sha256(data).hexdigest()

def git(*args): return subprocess.check_output(["git", *args], cwd=ROOT)

def run():
    ensure(not DEST.exists() and not OUTPUT.exists(), "QA_OUTPUT_ALREADY_EXISTS")
    ensure(SRC.is_file(), "PINNED_044_ZIP_INPUT_MISSING")
    previous = SRC.read_bytes()
    ensure(sha(previous) == BASE_SHA, "UNTRUSTED_PREVIOUS_044_ZIP")
    with zipfile.ZipFile(io.BytesIO(previous)) as z:
        names = z.namelist()
        ensure(len(names)==len(set(names)), "DUPLICATE_ZIP_ENTRY")
        ensure(set(ALLOWED).issubset(names), "MISSING_DOCK_ASSETS")
        entries = {}
        for n in names:
            ensure(not n.startswith("/") and not n.endswith("/") and
                   "\\" not in n and all(part not in ("", ".", "..") for part in n.split("/")), "UNSAFE_ZIP_ENTRY")
            entries[n] = z.read(n)
    head = git("rev-parse", "HEAD").decode().strip()
    changes = subprocess.check_output(["git", "diff", "--name-only", REVIEWED, head, "--",
      "web/maintrack/public", "supabase/functions/maintrack-stage9-security-api", 
      "android/maintrack-app/update-system", "android/maintrack-app/native"], cwd=ROOT).decode().splitlines()
    ensure(sorted(changes)==sorted("web/maintrack/public/"+f for f in ALLOWED),
           "OUT_OF_SCOPE_SOURCE_CHANGE: "+repr(changes))
    manifest = json.loads((QA / "owner-signed-044-manifest.json").read_text())
    ensure(manifest["payload"]["appId"]==APP and manifest["payload"]["bundleVersion"]=="0.4.4" and
           manifest["payload"]["sha256"]==BASE_SHA, "UNTRUSTED_SIGNED_MANIFEST")
    changed=[]
    for name in ALLOWED:
        original = git("show", REVIEWED + ":web/maintrack/public/"+name)
        ensure(original==entries[name], "044_ZIP_BASE_DOES_NOT_MATCH_REVIEWED_SOURCE_"+name)
        replacement=(PUBLIC / name).read_bytes()
        ensure(replacement!=original, "MISSING_EXPECTED_CHANGE_"+name)
        entries[name]=replacement
        changed.append(name)
    ensure(b"v6Dock" not in entries["v6-core.js"] and b"v6Dock" not in entries["v6-core.css"], "DOCK_REMAINS")
    ensure(b"stage20-native-session.js" in entries["index.html"] and
           b"maintrack-unified-four-qa/api" in entries["secure-assets/index-inline-1.js"],
           "SIGNED_044_NATIVE_SOURCE_OR_BACKEND_CHANGED")
    for name,raw in entries.items():
        destination=DEST / name
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_bytes(raw)
    with zipfile.ZipFile(OUTPUT,"w",zipfile.ZIP_DEFLATED) as z:
        for name in sorted(entries):
            info=zipfile.ZipInfo(name,(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644 << 16
            z.writestr(info,entries[name])
    with zipfile.ZipFile(OUTPUT) as z:
        ensure(z.namelist()==sorted(entries), "ARCHIVE_UNEXPECTED_ORDER")
        for name,data in entries.items():ensure(z.read(name)==data,"ARCHIVE_WRONG_ENTRY_"+name)
    # Web source bundle is unchanged except the two exact navigation modules.
    rec = {"schema":1,"status":"QA_ONLY_NOT_SIGNED_NOT_PUBLISHED",
           "baseSigned044Sha256":BASE_SHA,"candidateSha256":sha(OUTPUT.read_bytes()),
           "candidateBytes":OUTPUT.stat().st_size,"sourceCommit":head,"appId":APP,
           "mobileFix":"remove_bottom_bar_only","nativeSessionFix":"compile_existing_MainTrackSecureSessionPlugin_in_new_apk",
           "changedWebViewFiles":changed,"unchangedOtherWebViewFileCount":len(entries)-len(changed),
           "apiStill":"maintrack-unified-four-qa","nativeSameCertificateAsInstalled":"UNVERIFIED",
           "inPlaceInstallAuthorized":False}
    (QA / "delivery.json").write_text(json.dumps(rec,indent=2)+"\n")
    print("PASS TWO_ISSUES_ONLY",json.dumps(rec))

if __name__=="__main__":run()
