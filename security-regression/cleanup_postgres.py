"""Require an owned ephemeral PostgreSQL fixture; unavailable is BLOCKED, never PASS."""
import os,pathlib,shutil,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def main():
 if os.environ.get('MAINTRACK_CLEANUP_OWNED')!='MAINTRACK_CLEANUP_EPHEMERAL_V2' or os.environ.get('PGHOST') not in ('127.0.0.1','localhost') or os.environ.get('PGDATABASE') not in ('maintrack_cleanup_ci','maintrack_cleanup_lab') or os.environ.get('PGUSER')!='mt_lab_admin':
  print('BLOCKED: explicitly owned loopback PostgreSQL fixture required; no automatic database or cloud setup');return 78
 psql=os.environ.get('MAINTRACK_PSQL') or shutil.which('psql')
 if not psql:print('BLOCKED: PostgreSQL client unavailable');return 78
 env={**os.environ,'MAINTRACK_PSQL':psql,'MAINTRACK_CLEANUP_PG':'1'}
 result=subprocess.run([sys.executable,'-X','utf8','-m','unittest','discover','-s','security-regression/tests','-p','test_cleanup_postgres.py','-v'],cwd=ROOT,env=env,timeout=100)
 return result.returncode
if __name__=='__main__':raise SystemExit(main())
