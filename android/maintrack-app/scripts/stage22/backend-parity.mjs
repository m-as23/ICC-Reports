// Static backend parity check against exact archived Edge function sources.
// No Supabase credentials or DB writes. Does not validate runtime role decisions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='../../release/stage22/backend/';
const stable=fs.readFileSync(base+'stable-v10-rollback.ts','utf8');
const candidate=fs.readFileSync(base+'approved-qa-v15-candidate.ts','utf8');
function actions(s){return new Set([...s.matchAll(/(?:case\s+['"]([^'"]+)['"]|action\s*===\s*['"]([^'"]+)['"])/g)]
 .map(m=>m[1]||m[2]));}
function origins(s){
 const m=s.match(/const MT_ALLOWED_ORIGINS=new Set\(\[([\s\S]*?)\]\);/);
 assert.ok(m,'Approved CORS source not found');
 return new Set([...m[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));
}
const sa=actions(stable),qa=actions(candidate);
const expectedExtras=['accountSummary','overtimeMine','overtimeRequest','overtimeDecision','overtimeInbox','overtimeSummary'];
assert.ok(sa.size>=24,'Unexpected stable API baseline route count');
assert.ok([...sa].every(x=>qa.has(x)),
 'Candidate deleted stable API route: '+[...sa].filter(x=>!qa.has(x)));
assert.deepEqual([...qa].filter(x=>!sa.has(x)).sort(),expectedExtras.sort(),
 'Candidate has unreviewed new actions');
const so=origins(stable),qo=origins(candidate);
assert.ok([...so].every(o=>qo.has(o)),
 'Candidate CORS would block an existing stable client');
assert.ok(qo.has('https://localhost'),'Existing Android WebView origin blocked');
assert.ok(qo.has('https://maintrack-final-security-qa.vercel.app'));
assert.ok(qo.has('https://maintrack-final-security-ldgcbkqqw-mohamedashrefsrag-5918.vercel.app'));
assert.ok(stable.includes("Deno.env.get('SUPABASE_DB_URL')"));
assert.ok(candidate.includes("Deno.env.get('SUPABASE_DB_URL')"));
const out={
 type:'static-only-backend-api-parity',status:'PASS',
 stableActions:sa.size,candidateActions:qa.size,addedActions:expectedExtras,
 existingOriginsRetained:so.size,stagingOrigins:qo.size,
 backendDeployedToProduction:false,
 authenticatedRoleIntegrationTested:false,
 productionWriteTransactionsTested:false,
 rollbackSnapshot:'release/stage22/backend/stable-v10-rollback.ts',
 approvedQaSource:'release/stage22/backend/approved-qa-v15-candidate.ts',
 caveat:'Stable API must not be replaced before live authorization, old-client, and data-write acceptance checks.'
};
fs.mkdirSync('release-preflight',{recursive:true});
fs.writeFileSync('release-preflight/backend-parity.json',JSON.stringify(out,null,2)+'\n');
console.log('PASS stage22 static stable API action/CORS superset: '+sa.size+' -> '+qa.size);
