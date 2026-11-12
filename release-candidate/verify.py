"""Verify and reproduce the frozen MainTrack review inputs from Git."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent


def digest(data):
    return sha256(data).hexdigest()


def build(kind, expected):
    folder = ROOT / kind
    manifest = json.loads((folder / "PROVENANCE.json").read_bytes())
    if manifest["deployable"] is not False:
        raise ValueError(f"{kind}: expected a closed review candidate")
    names = set(manifest["files"]) | {"PROVENANCE.json"}
    if names != {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}:
        raise ValueError(f"{kind}: file set mismatch")
    buffer = BytesIO()
    with ZipFile(buffer, "w") as output:
        for name in sorted(names):
            data = (folder / name).read_bytes()
            if name != "PROVENANCE.json" and digest(data) != manifest["files"][name]:
                raise ValueError(f"{kind}: member mismatch {name}")
            output.writestr(ZipInfo(name), data)
    result = buffer.getvalue()
    if digest(result) != expected:
        raise ValueError(f"{kind}: archive mismatch")
    return result


def verify_web_parity():
    web = ROOT / "integrated/web"
    native = ROOT / "native/android/maintrack-app/www"
    for path in web.rglob("*"):
        if path.is_file() and path.name not in ("index.html", "runtime-binding.js"):
            if path.read_bytes() != (native / path.relative_to(web)).read_bytes():
                raise ValueError(f"Unexpected native Web change: {path.relative_to(web)}")
    for folder in (web, native):
        for path in folder.rglob("*"):
            if path.is_file() and any(marker in path.read_bytes() for marker in (
                b"/__review/", b"qa-fixture.js", b"fixture-1", b"tdnkeskczcsukcujwinu",
            )):
                raise ValueError(f"Unexpected QA or operational marker: {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    verify_web_parity()
    for kind, expected in json.loads((ROOT / "inputs.json").read_bytes()).items():
        data = build(kind, expected)
        if data != build(kind, expected):
            raise ValueError(f"{kind}: non-deterministic archive")
        if args.output:
            args.output.mkdir(parents=True, exist_ok=True)
            (args.output / f"maintrack-{kind}-{expected}.zip").write_bytes(data)
        print(f"{kind}: {expected} PASS")


if __name__ == "__main__":
    main()
