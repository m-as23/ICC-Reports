"""Bounded local MT-SEC-001/004 checks. No automatic setup, HTTP or cloud access."""
import argparse,os,pathlib,urllib.parse,sys
from engine import execute_bounded
from inventory_adapter import resolve_node

def main():
 if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
 p=argparse.ArgumentParser();p.add_argument('case',choices=('login','login-hosted','login-lease','login-idle','excel'));a=p.parse_args()
 root=pathlib.Path(__file__).resolve().parents[1]
 try:node=resolve_node()
 except FileNotFoundError as e:print('BLOCKED: '+str(e));return 78
 if a.case in ('login','login-hosted','login-lease','login-idle'):
  try:
   u=urllib.parse.urlsplit(os.environ.get('LOGIN_PG_URL',''))
   if u.scheme not in ('postgres','postgresql') or u.hostname not in ('127.0.0.1','localhost') or u.path!='/maintrack_auth_local' or u.query or u.fragment or u.username not in ('mt_local_admin','mt_lab_admin'):raise ValueError()
  except ValueError:print('BLOCKED: LOGIN_PG_URL must identify the explicitly owned loopback login fixture');return 78
  files={'login-hosted':['ops/maintrack/tests/login-hosted-admission.test.mjs'],'login-idle':['ops/maintrack/tests/login-idle-recovery.test.mjs'],'login-lease':['ops/maintrack/tests/qa-login-lease.test.mjs','ops/maintrack/tests/qa-login-rpc.test.mjs'],'login':['ops/maintrack/tests/login-rate-limit.test.mjs','ops/maintrack/tests/login-hosted-admission.test.mjs','ops/maintrack/tests/login-queue.test.mjs','ops/maintrack/tests/login-idle-recovery.test.mjs','ops/maintrack/tests/qa-login-lease.test.mjs','ops/maintrack/tests/qa-login-rpc.test.mjs']}[a.case]
 else:
  # import-service imports the existing seven real-parser cases; avoid duplicating them.
  files=['ops/maintrack/inventory/backend/test/import-service.test.mjs','ops/maintrack/inventory/backend/test/yauzl-security.test.mjs']
 result=execute_bounded([node,'--test','--test-concurrency=1',*files],root,40)
 print(result['output']);return int(result['status']!='PASS')

if __name__=='__main__':raise SystemExit(main())
