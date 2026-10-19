// MainTrack prelaunch API contract audit. Read-only: does NOT approve deployment.
// Action lists are independently checked against frozen source; deployed QA/legacy
// observations remain evidence only until Production deployment is separately verified.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../../..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(file(p));
const contract=json('ops/maintrack/production-api-contract.json');
const registry=json('ops/maintrack/runtime-registry-0.4.4.json');
const release=json('ops/maintrack/employee-release-gates.json');
const code=file('supabase/functions/maintrack-stage9-security-api/index.ts');
const frontend=file(contract.webSource.path);
const config=json('android/maintrack-app/capacitor.config.json');
const required=contract.requiredActions;
const found=[...new Set([...code.matchAll(/case\s+'([A-Za-z][A-Za-z0-9_]*)'\s*:/g)].map(m=>m[1]))];
const missing=required.filter(x=>!found.includes(x));
const extras=found.filter(x=>!required.includes(x));
assert.equal(contract.schema,1);
assert.equal(contract.state,'PRELAUNCH_NO_PRODUCTION_API');
assert.equal(contract.requiredAppId,registry.android.appId);
assert.equal(config.appId,registry.android.appId);
assert.equal(required.length,32,'MUST_LIST_32_CONTRACT_ACTIONS');
assert.equal(new Set(required).size,required.length,'DUPLICATE_API_ACTION_CONTRACT');
assert.deepEqual(missing,[],'STAGED_API_IS_MISSING_REQUIRED_ACTIONS');
assert.deepEqual(extras,[],'UNREVIEWED_NEW_ACTIONS_REQUIRE_CONTRACT_CHANGE');
assert.equal(found.length,32,'STAGED_API_CONTRACT_COUNT_DRIFT');
assert.equal(contract.liveSourceAudit.legacyFunction.verifiedCount,26);
assert.equal(contract.liveSourceAudit.qaFunction.verifiedCount,32);
assert.equal(contract.liveSourceAudit.qaFunction.hasAllRequiredActions,true);
const extras6=required.filter(x=>contract.liveSourceAudit.legacyFunction.missingRequiredActions.includes(x));
assert.deepEqual(new Set(extras6),new Set(['accountSummary','overtimeMine',
 'overtimeRequest','overtimeDecision','overtimeSummary','overtimeInbox']));
assert.equal(contract.webSource.productionReady,false,'UNREVIEWED_WEB_ENDPOINT_PROMOTED');
assert(frontend.includes(contract.webSource.embeddedLegacyApiPath),'WEB_API_URL_DRIFT');
assert(frontend.includes('maintrack-stage9-security-api/api'),'CANONICAL_WEB_SOURCE_API_DRIFT');
assert(!frontend.includes('/maintrack-unified-four-qa/api'),'QA_ONLY_ENDPOINT_EMBEDDED_IN_WEB_SOURCE');
assert.equal(registry.backend.staging.stableLegacyApi.actions,26);
assert.equal(registry.backend.staging.qaApi.actions,32);
assert.equal(registry.web.production.deployment,null,'PRODUCTION_WEB_DEPLOYMENT_NOT_AUDITED');
assert.equal(registry.backend.production.projectId,null,'PRODUCTION_BACKEND_NOT_AUDITED');
assert.equal(registry.database.production.projectId,null,'PRODUCTION_DB_NOT_AUDITED');
assert.equal(contract.policy.canUseStagingDatabaseAsProduction,false);
assert.equal(contract.policy.releaseEnabled,false,'PRODUCTION_NOT_AUTHORIZED');
assert.equal(release.approvedArchitecture.productionWebDeploymentAllowed,false);
assert.equal(release.approvedArchitecture.employeeAndroidApkReleaseAllowed,false);
console.log('PASS staged 32 API action contract / no unexpected dispatch changes');
console.log('PASS canonical Web source still points to deployed legacy 26-action function');
console.log('BLOCK: legacy 26-action live function is incompatible with reviewed 32-action UI');
console.log('BLOCK: no independent Prod DB/API/official Web deployment; employee rollout disabled');
