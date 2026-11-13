"""Compose the approved direct-Login update without activating a remote resource."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "release-candidate"
def runtime_origin():
    origin = os.environ.get("MAINTRACK_SUPABASE_ORIGIN", "")
    if not re.fullmatch(r"https://[a-z0-9]{20}\.supabase\.co", origin):
        raise ValueError("MAINTRACK_SUPABASE_ORIGIN must be the approved HTTPS Supabase origin")
    return origin


OLD_POST = (
    b"async function post(b){if(b.action==='login'){if(typeof window.MainTrackGatewayLogin"
    b"!=='function')throw Error('LOGIN_ADMISSION_CLIENT_NOT_READY');return await window.MainTrackGatewayLogin(b);}"
)


def replace(path, old, new, count=1):
    data = path.read_bytes()
    if data.count(old) != count:
        raise ValueError(f"Unexpected source contract: {path}")
    path.write_bytes(data.replace(old, new))


def bind(assets, host):
    core = host + "/functions/v1/maintrack-final-047/api"
    inventory = host + "/functions/v1/maintrack-inventory-final-047"
    binding = (
        "'use strict';\nObject.defineProperty(window,'MainTrackRuntime',{value:Object.freeze({\n"
        " core:" + json.dumps(core) + ",inventory:" + json.dumps(inventory) +
        ",admissionEnabled:false\n})});\n"
    )
    (assets / "runtime-binding.js").write_bytes(binding.replace('\n', '\r\n').encode())
    replace(assets / "index.html", b"connect-src 'self'", b"connect-src 'self' " + host.encode())
    replace(assets / "secure-assets/index-inline-1.js", OLD_POST, b"async function post(b){")


def build(output):
    host = runtime_origin()
    output.mkdir(parents=True, exist_ok=False)
    web = output / "web"
    native = output / "native-www"
    shutil.copytree(ROOT / "integrated/web", web)
    shutil.copytree(ROOT / "native/android/maintrack-app/www", native)
    bind(web, host)
    bind(native, host)
    headers = web / "vercel.json"
    shutil.copyfile(ROOT / "integrated/hosting/framing.json", headers)
    replace(headers, b"connect-src 'self';", b"connect-src 'self' " + host.encode() + b";", count=3)

    backend = output / "backend"
    core = backend / "maintrack-final-047"
    canonical = REPO / "supabase/functions/maintrack-final-047"
    core.mkdir(parents=True)
    for name in ("index.ts", "core-types.ts", "ledger-service.mjs", "login-rate-limit.mjs", "deno.json"):
        shutil.copyfile(canonical / name, core / name)
    shutil.copyfile(REPO / "ops/maintrack/security/registered-login.deno.lock", core / "deno.lock")
    shutil.copytree(ROOT / "production-backend/maintrack-inventory-final-047",
                    backend / "maintrack-inventory-final-047")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
