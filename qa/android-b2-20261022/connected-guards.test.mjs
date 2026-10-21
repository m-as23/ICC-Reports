import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCiCredentials,chooseLeaveDate} from './connected-guards.mjs';
test('credential parse and shape failures never repeat input',()=>{for(const s of ['{"engineer":"PRIVATE_MARKER',JSON.stringify({engineer:'PRIVATE_MARKER'})]){assert.throws(()=>parseCiCredentials(s),e=>e.message==='B2_CI_CREDENTIALS_REQUIRED'&&!String(e.stack).includes('PRIVATE_MARKER'));}});
test('accepts bounded dedicated role passwords',()=>{const x={owner:'a'.repeat(32),engineer:'b'.repeat(32),technician:'c'.repeat(32)};assert.deepEqual(parseCiCredentials(JSON.stringify(x)),x);});
test('selects fresh fixture date before writes; rejected rows do not block',()=>{const rows=[{start:'2026-11-12',end:'2026-11-13',status:'APPROVED'},{start:'2026-11-14',end:'2026-11-14',status:'REJECTED'}];assert.equal(chooseLeaveDate(rows),'2026-11-14');assert.throws(()=>chooseLeaveDate([{start:'2026-11-12',end:'2026-12-31',status:'PENDING'}]),/B2_FIXTURE_UNAVAILABLE/);assert.throws(()=>chooseLeaveDate(null),/B2_FIXTURE_UNAVAILABLE/);});
