#!/usr/bin/env python3
"""Create tiny, deterministic QA-only OTA fixtures. No Supabase, customer data or production credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZipInfo
import hashlib, json

root=Path(__file__).resolve().parents[2]
source=root / "android/maintrack-app/www/secure-assets/stage13-native-ready.js"
destination=root / "qa/stage14"
destination.mkdir(parents=True,exist_ok=True)
assert source.stat().st_size < 180000
bootstrap=source.read_bytes()
healthy=b'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>MainTrack OTA LAB GOOD</title><script src="stage13-native-ready.js"></script></head><body><h1>MainTrack Stage14 Healthy OTA</h1><script>
const q=JSON.parse(localStorage.getItem('q')||'[]');
if(q.length===0)console.log('MT_STAGE14_PENDING_QUEUE_CLEARED_BEFORE_UPDATE');
else console.error('MT_STAGE14_UNSAFE_QUEUE_SWITCH');
if(localStorage.getItem('stage14-qa-persist')==='intact')console.log('MT_STAGE14_GOOD_LOCAL_STATE_PRESERVED');
else console.error('MT_STAGE14_GOOD_LOCAL_STATE_LOST');
console.log('MT_STAGE14_GOOD_BUNDLE_RUNNING');
</script></body></html>'''
faulty=b'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>MainTrack OTA LAB BROKEN</title></head><body><h1>Deliberately missing updater readiness!</h1><script>console.log('MT_STAGE14_BAD_BUNDLE_RUNNING');</script></body></html>'''

def add(archive,name,data):
 info=ZipInfo(name,(2026,1,1,0,0,0))
 info.compress_type=ZIP_STORED
 info.external_attr=0o644<<16
 archive.writestr(info,data)

result={}
for label,contents in [('healthy',{'index.html':healthy,'stage13-native-ready.js':bootstrap}),('faulty',{'index.html':faulty})]:
 output=destination/(label+'.zip')
 with ZipFile(output,'w') as z:
  for name,data in sorted(contents.items()):
   assert not name.startswith('/') and '..' not in name
   add(z,name,data)
 raw=output.read_bytes()
 result[label]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'files':sorted(contents)}
 assert result[label]['bytes']<250000
(destination/'fixtures.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
print('PASS: deterministic, offline, self-contained good/faulty OTA bundles:',json.dumps(result,indent=2))
