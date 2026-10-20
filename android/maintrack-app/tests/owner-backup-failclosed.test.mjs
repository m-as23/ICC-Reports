import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..');
const p=path.join(root,'ops/maintrack/scripts/owner-encrypted-staging-backup.sh');
test('Staging data export is refused unless Owner explicitly opts in',()=>{
 const lint=spawnSync('bash',['-n',p],{encoding:'utf8',timeout:8000});
 assert.equal(lint.status,0,lint.stderr);
 const result=spawnSync('bash',[p],{encoding:'utf8',timeout:8000,
   env:{PATH:process.env.PATH}});
 assert.equal(result.status,3);
 assert.match(result.stderr,/explicit local owner backup consent required/);
 assert.doesNotMatch(result.stdout,/Ciphertext path:/);
});
test('backup script streams plaintext directly to age and forbids Git repository storage',()=>{
 const s=fs.readFileSync(p,'utf8');
 assert.match(s,/pg_dump --format=custom --no-owner --no-privileges/);
 assert.match(s,/\| age -r "\$AGE_BACKUP_RECIPIENT" -o "\$tmp"/);
 assert.match(s,/backup cannot be written inside a Git repository/);
 assert.match(s,/Offsite upload and actual restore verification STILL REQUIRED/);
 assert.ok(!s.includes('tee ')&&!s.includes('service_role')&&!s.includes('--file='),
   'Backing file must be encrypted without plaintext archive intermediates');
});
