#!/usr/bin/env python3
"""One-time verification/import of accepted secure web assets from tested APK. No network/API/DB access."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "web" / "maintrack" / "public"
LOCK = ROOT / "android" / "maintrack-app" / "approved-assets.lock.json"

def sha256(blob):
    return hashlib.sha256(blob).hexdigest()

def import_apk(path):
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    assert lock["sourceDeployment"] == "dpl_ARyE7KNjFKMfJCWQ4YcZZMXxykhF"
    resources = lock["assets"]
    assert len(resources) >= 15
    DEST.mkdir(parents=True, exist_ok=True)
    with ZipFile(path) as apk:
        for item in resources:
            name = item["path"]
            assert ".." not in name and not name.startswith("/") and "\\" not in name
            native = apk.read("assets/public/" + name)
            expected = lock["nativeIndex"] if name == "index.html" else item
            assert len(native) == expected["bytes"], f"Size mismatch {name}"
            assert sha256(native) == expected["sha256"], f"SHA mismatch {name}"
            target = DEST / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(native)
    index = (DEST / "index.html").read_text(encoding="utf-8")
    assert "maintrack-stage6-api/api" not in index
    assert "Content-Security-Policy" in index
    js = (DEST / "secure-assets/index-inline-1.js").read_text(encoding="utf-8")
    assert "maintrack-stage9-security-api/api" in js
    assert "maintrack-stage6-api/api" not in js
    (ROOT / "web/maintrack/source-lock.json").write_text(json.dumps(lock, indent=2)+"\n", encoding="utf-8")
    (ROOT / "web/maintrack/README.md").write_text(
        "# MainTrack shared web/Android secure UI source\n\n"
        "Immutable Stage11 reviewed secure web assets, extracted byte-for-byte from the "
        "successful locked Android APK, verified against approved-assets.lock.json.\n\n"
        "The web preview artifact and Android lab build consume these identical sources; "
        "no Vercel production deployment occurs automatically. Do not commit credentials, "
        "OTA signing private keys or runtime session files.\n",
        encoding="utf-8",
    )
    print(f"PASS verified {len(resources)} immutable resources in {DEST}")

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("apk")
    import_apk(Path(p.parse_args().apk))
