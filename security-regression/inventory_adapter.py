"""Run the existing pure service tests; no HTTP, database, parser or cloud writes."""
import os,pathlib,shutil
from engine import execute_bounded
def resolve_node():
 override=os.environ.get('MAINTRACK_NODE','').strip()
 if override:
  p=pathlib.Path(override).expanduser()
  if not p.is_file():raise FileNotFoundError('MAINTRACK_NODE must name an existing Node executable')
  return str(p.resolve())
 node=shutil.which('node')
 if not node:raise FileNotFoundError('Node missing: provide PATH or MAINTRACK_NODE; no automatic install')
 return node

def main():
 root=pathlib.Path(__file__).resolve().parents[1]
 source=root if (root/'ops/maintrack/inventory/backend/test/inventory-service.test.mjs').exists() else root/'source'
 try:node=resolve_node()
 except FileNotFoundError as e:print('NOT TESTED: '+str(e));return 2
 r=execute_bounded([node,'--test','ops/maintrack/inventory/backend/test/inventory-service.test.mjs'],source,20)
 print(r['output']);return 0 if r['status']=='PASS' else 1

if __name__=='__main__':raise SystemExit(main())
