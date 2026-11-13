// Policy/dispatch contracts with injected runners. Not live CLI, human approval or Cloud Acceptance.
import test from 'node:test';import assert from 'node:assert/strict';
import {plan,QA_REF,ACK,OWNER_SHA,requireAcknowledgement,requireMetadata,config,backupSummary,InvocationBudget,metadataQuery} from '../recovery/qa-ssl-console.mjs';
const quiet=()=>({projectRef:QA_REF,database:'postgres',sqlUser:'postgres',sessionUser:'postgres',createRole:true,cronJobs:0,activeCronJobs:0,ledgerRows:0,validSessions:0,sessionRows:6,unclosedLeases:0,activeClientTransactions:0,qaRuntimeConnections:0,permanentSchemaPresent:false});
test('default plan is read-only and always pins the existing IPv4 verify-full endpoint',()=>{
 const p=plan();assert.equal(p.mode,'Preflight');assert.equal(p.maximumEnableWrites,1);assert.equal(p.maximumMinutes,15);assert.equal(p.maximumCliInvocations,8);assert.equal(p.cloudAcceptance,'NOT TESTED');
 assert.match(p.connection,/host=aws-1-eu-central-1\.pooler\.supabase\.com port=5432 user=postgres\.szhstrafzkxzstjdcynl/);assert.match(p.connection,/sslmode=verify-full/);assert.match(p.connection,/hostaddr=''/);
 for(const mode of ['RestorePrevious','disable','invalid'])assert.throws(()=>plan({mode}),/INVALID_MODE/);
 assert.throws(()=>plan({'project-ref':'other-project'}),/WRONG_QA_PROJECT/);assert.throws(()=>plan({token:'not accepted'}),/UNKNOWN_OPTION/);assert.match(OWNER_SHA,/^[a-f0-9]{64}$/);
});
test('maintenance acknowledgement cannot be supplied by a noninteractive process or expired window',()=>{
 const base={inputTTY:true,outputTTY:true,ack:ACK,now:10,deadline:100};
 assert.doesNotThrow(()=>requireAcknowledgement(base));
 for(const patch of [{inputTTY:false},{outputTTY:false},{ack:'yes'},{ack:ACK+' '},{now:100}])assert.throws(()=>requireAcknowledgement({...base,...patch}));
});
test('metadata guard preserves expired rows and refuses every unsafe or unknown count',()=>{
 assert.equal(requireMetadata(quiet()).sessionRows,6);
 for(const key of ['cronJobs','activeCronJobs','ledgerRows','validSessions','unclosedLeases','activeClientTransactions','qaRuntimeConnections'])for(const value of [1,null,'0',-1])assert.throws(()=>requireMetadata({...quiet(),[key]:value}),/QA_NOT_QUIESCENT/);
 for(const patch of [{projectRef:'wrong'},{database:'other'},{sqlUser:'runtime'},{sessionUser:'runtime'},{createRole:false},{permanentSchemaPresent:true}])assert.throws(()=>requireMetadata({...quiet(),...patch}));
 assert.match(metadataQuery,/BEGIN READ ONLY/);assert.match(metadataQuery,/IS NOT TRUE/);assert.match(metadataQuery,/ROLLBACK/);assert.doesNotMatch(metadataQuery,/password_hash|token_hash|rolpassword|pg_authid|baseline|SELECT\s+\*/i);
});
test('SSL GET must prove a settled boolean, not infer protection from a label',()=>{
 assert.deepEqual(config({appliedSuccessfully:true,currentConfig:{database:false}}),{database:false,appliedSuccessfully:true});
 assert.deepEqual(config({appliedSuccessfully:true,currentConfig:{database:true}}),{database:true,appliedSuccessfully:true});
 for(const value of [null,{appliedSuccessfully:false,currentConfig:{database:true}},{appliedSuccessfully:true,currentConfig:{database:'true'}}])assert.throws(()=>config(value),/SSL_CONFIGURATION_NOT_SETTLED/);
});
test('null or listed backup metadata never becomes a verified full-data backup',()=>{
 for(const value of [null,{}, {backups:null,physical_backup_data:{}},{backups:[],pitr_enabled:false},{backups:[{status:'COMPLETED'}],pitr_enabled:true}])assert.equal(backupSummary(value).fullDataRecoveryVerified,false);
 assert.equal(backupSummary({backups:[]}).listedArtifacts,0);assert.equal(backupSummary(null).listedArtifacts,null);
});
test('enable dispatch is journaled durably before exactly one attempt; ambiguous outcome never retries',()=>{
 const j={deadlineMs:1000,cliInvocations:0,enableAttempted:false,operations:[]};let calls=0,saves=0;
 const b=new InvocationBudget({now:()=>10,journal:j,save:()=>{saves++;assert.equal(j.enableAttempted,true);assert.ok(calls<=1);},run:()=>{calls++;assert.equal(saves,1);return {error:{code:'ETIMEDOUT'},status:null};}});
 assert.throws(()=>b.dispatch(['ssl-enforcement','update'],{write:true}),/ENABLE_OUTCOME_AMBIGUOUS_NO_RETRY/);assert.equal(calls,1);assert.equal(j.cliInvocations,1);
 assert.throws(()=>b.dispatch(['ssl-enforcement','update'],{write:true}),/ENABLE_WRITE_ALREADY_ATTEMPTED/);assert.equal(calls,1);
});
test('CLI budget and elapsed deadline reject before runner dispatch and never reset counters',()=>{
 const j={deadlineMs:60000,cliInvocations:0,enableAttempted:false,operations:[]};let calls=0,now=0,waits=0;
 const b=new InvocationBudget({now:()=>now,wait:ms=>{assert.equal(ms,2600);now+=ms;waits++;},journal:j,save:()=>{},run:()=>{calls++;return {status:0,stdout:'{}'};}});
 for(let i=0;i<8;i++)b.dispatch(['read','only']);assert.equal(calls,8);assert.equal(j.cliInvocations,8);
 assert.throws(()=>b.dispatch(['read','only']),/CLI_INVOCATION_LIMIT/);assert.equal(calls,8);assert.equal(waits,7);
 const other=new InvocationBudget({now:()=>1000,journal:{...j,deadlineMs:1000,cliInvocations:0},save:()=>{},run:()=>{throw Error('MUST_NOT_DISPATCH');}});assert.throws(()=>other.dispatch(['read','only']),/MAINTENANCE_DEADLINE/);
 let jumped=0;const oversleep=new InvocationBudget({now:()=>jumped,wait:()=>{jumped=10000;},journal:{deadlineMs:5000,cliInvocations:0,enableAttempted:false,operations:[],lastExternalFinishedMs:0},save:()=>{},run:()=>{throw Error('MUST_NOT_DISPATCH');}});assert.throws(()=>oversleep.dispatch(['ssl-enforcement','update'],{write:true}),/MAINTENANCE_DEADLINE/);assert.equal(oversleep.journal.enableAttempted,false);
});
