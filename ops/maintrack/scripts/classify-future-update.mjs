// Read-only impact classifier for future MainTrack feature/fix PRs.
// This never deploys, signs, changes a database or approves a release.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const baseRef='refs/heads/ops/maintrack-044-production-foundation-20261018';
const sha=/^[a-f0-9]{40}$/;
const run=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const head=run('rev-parse','HEAD');
if(!sha.test(head))throw Error('INVALID_HEAD_SHA');
run('fetch','--no-tags','origin',baseRef);
const base=run('merge-base',head,'FETCH_HEAD');
if(!sha.test(base))throw Error('MISSING_TRUSTED_BASE');
const names=run('diff','--name-only',base,head,'--').split('\n').filter(Boolean);
const categories=new Set();
const unknown=[];
for(const file of names){
  if(file.startsWith('web/maintrack/'))categories.add('web-interface');
  else if(file.startsWith('supabase/functions/'))categories.add('api');
  else if(file.startsWith('db/'))categories.add('database');
  else if(file.startsWith('android/maintrack-app/update-system/'))categories.add('signed-ota');
  else if(file.startsWith('android/maintrack-app/native/') || file.startsWith('android/maintrack-app/scripts/harden-native') ||
      file.startsWith('android/maintrack-app/capacitor.config') || file.startsWith('android/maintrack-app/package'))categories.add('native-android');
  else if(file.startsWith('android/maintrack-app/tests/')||file.startsWith('android/maintrack-app/tests-browser/')||
      file.startsWith('android/maintrack-app/tests-release/'))categories.add('qa-tests');
  else if(file.startsWith('android/'))categories.add('native-android');
  else if(file.startsWith('.github/'))categories.add('release-ci');
  else if(file.startsWith('ops/maintrack/'))categories.add('release-policy');
  else if(file.startsWith('qa/'))categories.add('qa-fixtures');
  else if(file.endsWith('.md')||file.endsWith('.txt'))categories.add('documentation');
  else unknown.push(file);
  if(/(^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:jks|keystore|p12|pfx|pem|key))$/i.test(file))
    throw Error('BLOCKED_SECRET_OR_SIGNING_KEY_IN_GIT: '+file);
}
if(unknown.length)throw Error('UNKNOWN_UPDATE_SURFACE_REQUIRES_REVIEW: '+unknown.join(', '));
const flags={
  web:categories.has('web-interface'),
  ota:categories.has('signed-ota')||categories.has('web-interface'),
  native:categories.has('native-android'),
  api:categories.has('api'),
  db:categories.has('database'),
  highRisk:categories.has('database')||categories.has('api')||categories.has('native-android')||categories.has('release-ci')||categories.has('release-policy')
};
const report={schema:1,project:'MainTrack',mode:'QA_ONLY_NO_DEPLOY',base,head,paths:names,categories:[...categories].sort(),flags,
  mustObtainOwnerApproval:true,automaticStagingMutationsAllowed:false,
  productionEmployeeReleaseAllowed:false,immutableBaselineMustRemainUntouched:true};
fs.mkdirSync('audit-output',{recursive:true});
fs.writeFileSync('audit-output/update-impact.json',JSON.stringify(report,null,2)+'\n');
console.log('QA_CHANGE_CLASSIFIED',JSON.stringify({base,head,categories:report.categories,flags}));
console.log('NO_DEPLOY; NO_APK_SIGNING; NO_DATABASE_CHANGE; NO_EMPLOYEE_RELEASE');
if(process.env.GITHUB_STEP_SUMMARY){
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    ['## MainTrack — Future update impact','',
    'Source commit: '+head,
    'Change categories: '+(report.categories.join(', ')||'none'),'',
    '| Gate | Required? |','|---|---|',
    '| Web / signed OTA smoke | '+(flags.ota?'YES':'when release is assembled')+' |',
    '| Signed native APK upgrade test | '+(flags.native?'YES':'only when native changes')+' |',
    '| API roles and compatibility | '+(flags.api?'YES':'always run core regression')+' |',
    '| DB migration and restore plan | '+(flags.db?'YES':'if schema changes')+' |','',
    '**QA-only. No deployment is authorized by this report. Owner must approve exact version before any release.**',''
    ].join('\n')+'\n');
}
