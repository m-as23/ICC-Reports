import {spawnSync} from 'node:child_process';
const TICK=/\bCALL\s+maintrack_qa_permanent\.tick\s*\(\s*\)/i;
const ONLY_TICK=/^\s*CALL\s+maintrack_qa_permanent\.tick\s*\(\s*\)\s*;?\s*$/i;
export function prepareQaSql({operation,commands}) {
  if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(operation||'')||!Array.isArray(commands)||!commands.length||commands.some(x=>typeof x!=='string'||!x.trim())) throw Error('NAMED_SQL_COMMANDS_REQUIRED');
  let transaction=false;
  for(const sql of commands) {
    const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\r\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
    if(TICK.test(code)&&(!ONLY_TICK.test(sql)||transaction)) throw Error('TICK_REQUIRES_TOP_LEVEL_COMMAND');
    if(/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(code)) transaction=true;
    if(/\b(COMMIT|ROLLBACK)\s*;?\s*$/i.test(code)) transaction=false;
  }
  return {operation,requestCount:commands.length,batchCount:1,sqlArgs:commands.flatMap(sql=>['-c',sql])};
}
export function executeQaSql({operation,commands,charge,record,spawn=spawnSync,onFailure=()=>{}}) {
  const p=prepareQaSql({operation,commands});
  charge(p.requestCount);
  record({operation,status:'ATTEMPTED',sqlRequests:p.requestCount,processBatches:1});
  const r=spawn('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1','-d',"service=maintrack_qa_recovery sslmode=verify-full connect_timeout=8 options='-c statement_timeout=10000 -c lock_timeout=2000'",...p.sqlArgs],{encoding:'utf8',windowsHide:true,timeout:15000*p.requestCount});
  if(r.status!==0||r.error) {
    record({operation,status:'FAILED',exitCode:r.status??null,automaticRetries:0});
    onFailure(r.stderr||'');
    throw Error(operation+':SQL_FAILED_NO_RETRY');
  }
  record({operation,status:'PASS',automaticRetries:0});
  return (r.stdout||'').trim().split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x)).at(-1);
}
export const mayStartRecovery=stage=>!['COMPLETE','RECOVERY_BLOCKED','STOPPING'].includes(stage);
