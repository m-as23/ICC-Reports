"""Portable local Node suites using the same validated runtime as Inventory."""
import pathlib
from inventory_adapter import resolve_node
from engine import execute_bounded
def main():
 root=pathlib.Path(__file__).resolve().parents[1]
 try:node=resolve_node()
 except FileNotFoundError as e:print('NOT TESTED: '+str(e));return 2
 result=execute_bounded([node,'--test','remediation/logout/tests/logout.test.mjs','ops/maintrack/tests/security-overlay.test.mjs'],root,30)
 print(result['output']);return int(result['status']!='PASS')
if __name__=='__main__':raise SystemExit(main())
