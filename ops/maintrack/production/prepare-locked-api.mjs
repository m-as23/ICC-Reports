// MainTrack Production foundation: prepares a permanently LOCKED 32-action backend candidate.
// Never deploys, mutates Supabase, emails anyone, or enables a production URL.
// Production project and official allowed origin must be independently owner-reviewed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'../../..');
const srcPath=path.join(root,'supabase/functions/maintrack-stage9-security-api/index.ts');
const contractPath=path.join(root,'ops/maintrack/production-api-contract.json');
const output=path.join(root,'audit-output/maintrack-production-backend-LOCKED/index.ts');
export const PINNED_GIT_BLOB='92a8e32618450a5d5e507cbc7d69f34110dbc14d';
export const sha256=s=>createHash('sha256').update(s).digest('hex');
export const gitBlob=s=>{const b=Buffer.from(s);return createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');};
export const LOCKED='const MAINTRACK_PRODUCTION_OWNER_RELEASE_AUTHORIZED=false;';

export function prepareProductionLocked(source,required){
 assert.equal(gitBlob(source),PINNED_GIT_BLOB,'REVIEWED_BACKEND_SOURCE_CHANGED');
 assert.equal(required.length,32,'EXPECTED_32_ACTIONS');
 const actions=[...new Set([...source.matchAll(/case\s+'([A-Za-z][A-Za-z0-9_]*)'\s*:/g)].map(x=>x[1]))];
 assert.deepEqual([...actions].sort(),[...required].sort(),'API_ACTION_PARITY_FAILURE');
 const pool="const pool=new pg.Pool({connectionString:Deno.env.get('SUPABASE_DB_URL'),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:6000});";
 assert.equal(source.split(pool).length,2,'UNEXPECTED_DB_CONNECTION');
 const matches=source.match(/const MT_ALLOWED_ORIGINS=new Set\(\[[\s\S]*?\]\);/g);
 assert.equal(matches?.length,1,'UNEXPECTED_CORS_CONFIG');
 const imports="import {randomBytes,randomUUID,createHash} from 'node:crypto';";
 assert.equal(source.split(imports).length,2,'UNEXPECTED_MODULE_IMPORT');
 const guard=`
 // Production is completely fail-closed until a separate owner-reviewed code change.
 ${LOCKED}
 const MAINTRACK_PROD_REF=Deno.env.get('MAINTRACK_PRODUCTION_PROJECT_REF')||'';
 const MAINTRACK_PROD_ORIGIN=Deno.env.get('MAINTRACK_PRODUCTION_WEB_ORIGIN')||'';
 const MAINTRACK_OFFICIAL_ORIGIN=(()=>{
   try {const u=new URL(MAINTRACK_PROD_ORIGIN);
     return u.protocol==='https:'&&u.origin===MAINTRACK_PROD_ORIGIN&&!!u.hostname;}
   catch {return false;}
 })();
 if(!MAINTRACK_PRODUCTION_OWNER_RELEASE_AUTHORIZED ||
    !/^[a-z]{20}$/.test(MAINTRACK_PROD_REF) ||
    ['tdnkeskczcsukcujwinu','szhstrafzkxzstjdcynl'].includes(MAINTRACK_PROD_REF) ||
    Deno.env.get('SUPABASE_URL')!=='https://'+MAINTRACK_PROD_REF+'.supabase.co' ||
    !MAINTRACK_OFFICIAL_ORIGIN)
   throw new Error('MAINTRACK_PRODUCTION_RELEASE_LOCKED');
 `;
 let generated=source.replace(imports,imports+'\n'+guard)
   .replace(pool,"const pool=new pg.Pool({connectionString:Deno.env.get('SUPABASE_DB_URL'),max:2,options:'-c search_path=mt_prod,public,extensions',idleTimeoutMillis:10000,connectionTimeoutMillis:6000});")
   .replace(matches[0],'const MT_ALLOWED_ORIGINS=new Set([MAINTRACK_PROD_ORIGIN]);');
 assert.notEqual(generated,source);
 assert.ok(generated.includes(LOCKED)&&generated.includes('MAINTRACK_PRODUCTION_RELEASE_LOCKED'));
 assert.ok(generated.includes('search_path=mt_prod,public,extensions'));
 for(const forbidden of ['tdnkeskczcsukcujwinu.supabase.co','szhstrafzkxzstjdcynl.supabase.co',
   'maintrack-unified-four-qa/api','maintrack-stage9-security-api/api'])
  assert.ok(!generated.includes(forbidden),'FORBIDDEN_BACKEND_URL:'+forbidden);
 return {source:generated,report:{state:'NO_GO_PRODUCTION_LOCKED',actions:32,
   pinnedGitBlob:PINNED_GIT_BLOB,srcHash:sha256(source),candidateHash:sha256(generated),
   dbSchema:'mt_prod',productionProjectRef:null,productionWebOrigin:null,
   ownerReleaseAuthorized:false,deploy:false,webDeploy:false,apkBuild:false,signing:false}};
}

function main(){
 const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
 const {source,report}=prepareProductionLocked(fs.readFileSync(srcPath,'utf8'),contract.requiredActions);
 const mode=process.argv[2]||'--check';
 if(mode==='--prepare'){
   assert.ok(output.startsWith(path.join(root,'audit-output')+path.sep));
   fs.mkdirSync(path.dirname(output),{recursive:true});
   fs.writeFileSync(output,source,{flag:'wx'});
   fs.writeFileSync(path.join(path.dirname(output),'provenance.json'),
       JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 } else if(mode!=='--check')throw Error('INVALID_MODE');
 console.log('PASS: production backend 32/32 actions aligned and hard-locked. NO DEPLOYMENT.');
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
