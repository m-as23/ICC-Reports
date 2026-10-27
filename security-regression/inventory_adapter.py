"""Run the existing pure service tests; no HTTP, database, parser or cloud writes."""
import os,pathlib,shutil,sys
from engine import execute_bounded
root=pathlib.Path(__file__).resolve().parents[1]
source=root if (root/'ops/maintrack/inventory/backend/test/inventory-service.test.mjs').exists() else root/'source'
node=os.environ.get('MAINTRACK_NODE') or shutil.which('node')
if not node:
 bundled=pathlib.Path(r'C:\Users\moham\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
 if bundled.exists():node=str(bundled)
if not node:raise SystemExit('NOT TESTED: NODE_MISSING')
r=execute_bounded([node,'--test','ops/maintrack/inventory/backend/test/inventory-service.test.mjs'],source,20)
print(r['output']);raise SystemExit(0 if r['status']=='PASS' else 1)
