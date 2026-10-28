"""The private definer owns cron API execution; do not grant it to its callers."""
import pathlib,re,unittest
class CronLeastPrivilege(unittest.TestCase):
 def test_no_direct_cron_alter_job_grant_in_installation(self):
  source=(pathlib.Path(__file__).resolve().parents[2]/'ops/maintrack/security/qa-cleanup-lease.sql').read_text()
  grants=re.findall(r'GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+.*?;',source,re.I|re.S)
  self.assertFalse(any('cron.alter_job' in x for x in grants),'Use private SECURITY DEFINER, not direct cron API grants')
if __name__=='__main__':unittest.main()
