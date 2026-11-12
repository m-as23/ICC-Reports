import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareQaSql,mayStartRecovery} from '../recovery/qa-native-sql.mjs';
test('separate commands cannot wrap tick in an external transaction',()=>assert.throws(()=>prepareQaSql({operation:'ARM_WINDOW',commands:['BEGIN','CALL maintrack_qa_permanent.tick()','COMMIT']}),/TICK_REQUIRES_TOP_LEVEL_COMMAND/));
test('blocked, active or completed recovery is not automatically repeated',()=>{for(const stage of ['COMPLETE','RECOVERY_BLOCKED','STOPPING'])assert.equal(mayStartRecovery(stage),false);assert.equal(mayStartRecovery('PREPARED'),true);});
